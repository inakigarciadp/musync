import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect } from "effect";
import { LucidaSearchError } from "../domain/errors/lucida";
import type { LucidaTrack } from "../domain/models/lucida";

export class LucidaService extends Effect.Service<LucidaService>()(
  "LucidaService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      // Mutable state for rate limiting (last request timestamp)
      let lastRequestTime = 0;
      const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

      const search = Effect.fn("LucidaService.search")(function* (
        songName: string,
        artistName: string,
        limit: number = 5,
      ) {
        // Rate limiting: wait if needed
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
          yield* Effect.sleep(
            `${MIN_REQUEST_INTERVAL - timeSinceLastRequest} millis`,
          );
        }
        lastRequestTime = Date.now();

        const query = `${artistName} ${songName}`;
        const encodedQuery = encodeURIComponent(query);

        const request = HttpClientRequest.get(
          `/search?service=tidal&country=US&query=${encodedQuery}`,
        );

        const response = yield* http.execute(request).pipe(
          Effect.mapError((e) =>
            LucidaSearchError.make({
              message: `HTTP request failed: ${e.message}`,
              cause: e,
              isRateLimit:
                e._tag === "ResponseError" && e.response.status === 429,
              query,
            }),
          ),
        );

        // Access text as instance property on the response
        const html = yield* response.text.pipe(
          Effect.mapError((e) =>
            LucidaSearchError.make({
              message: `Failed to read response body: ${e.message}`,
              cause: e,
              query,
            }),
          ),
        );

        const tracks = parseSearchResults(html);

        return tracks.slice(0, limit);
      });

      return { search };
    }),
  },
) {}

/**
 * Extract tracks from embedded JSON in lucida.to HTML.
 *
 * The HTML contains SvelteKit data in the format:
 * const data = [{...}, { data: { results: { results: { tracks: [...] } } } }];
 *
 * We use a bracket-counting parser because:
 * 1. Standard JSON.parse fails on partial JSON
 * 2. The JSON is embedded in JavaScript, not standalone
 */
function extractTracksFromJson(html: string): LucidaTrack[] {
  const startMarker = "const data = [";
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return [];

  const jsonStart = startIdx + "const data = ".length;

  // Bracket-counting parser to find the end of the JSON array
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let endIdx = jsonStart;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inString) {
      inString = true;
    } else if (char === '"' && inString) {
      inString = false;
    } else if (!inString) {
      if (char === "[" || char === "{") {
        bracketCount++;
      } else if (char === "]" || char === "}") {
        bracketCount--;
        if (bracketCount === 0 && html.slice(i, i + 2) === "];") {
          endIdx = i + 1;
          break;
        }
      }
    }
  }

  const jsonStr = html.slice(jsonStart, endIdx);

  try {
    const data = JSON.parse(jsonStr);
    // Navigate: data[1].data.results.results.tracks
    const tracks = data?.[1]?.data?.results?.results?.tracks ?? [];

    // biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown structure
    return tracks.map((track: any) => ({
      name: track.title ?? "",
      // biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown structure
      artist: (track.artists ?? []).map((a: any) => a.name).join(", "),
      album: track.album?.title ?? null,
      url: track.url ?? "",
    }));
  } catch {
    return [];
  }
}

/**
 * Fallback HTML parsing for lucida.to search results.
 *
 * Expected HTML structure:
 * <div class="search-result-track">
 *   <div class="metadata">
 *     <h1><a href="...">Track Name</a></h1>
 *     <h2>Artist Name</h2>
 *     <h3>Album Name</h3>
 *   </div>
 * </div>
 */
function extractTracksFromHtml(html: string): LucidaTrack[] {
  const tracks: LucidaTrack[] = [];

  // Simple regex-based parsing
  const trackBlockRegex =
    /<div class="search-result-track">([\s\S]*?)<\/div>\s*<\/div>/g;

  for (const match of html.matchAll(trackBlockRegex)) {
    const block = match[1];
    if (!block) continue;

    // Extract track name and URL from h1 > a
    const titleMatch =
      /<h1[^>]*><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/h1>/i.exec(block);
    const artistMatch = /<h2[^>]*>([^<]*)<\/h2>/i.exec(block);
    const albumMatch = /<h3[^>]*>([^<]*)<\/h3>/i.exec(block);

    const trackUrl = titleMatch?.[1];
    const trackName = titleMatch?.[2];

    if (trackUrl && trackName) {
      tracks.push({
        name: trackName.trim(),
        artist: artistMatch?.[1]?.trim() ?? "",
        album: albumMatch?.[1]?.trim() ?? null,
        url: trackUrl.startsWith("http")
          ? trackUrl
          : `https://lucida.to${trackUrl}`,
      });
    }
  }

  return tracks;
}

/**
 * Parse search results - try JSON first, fallback to HTML.
 */
function parseSearchResults(html: string): LucidaTrack[] {
  // Try JSON extraction first (more reliable)
  const jsonTracks = extractTracksFromJson(html);
  if (jsonTracks.length > 0) {
    return jsonTracks;
  }

  // Fallback to HTML parsing
  return extractTracksFromHtml(html);
}
