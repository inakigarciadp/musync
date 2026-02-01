import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect } from "effect";
import { LucidaParseError, LucidaSearchError } from "../domain/errors/lucida";
import type { LucidaTrack } from "../domain/models/lucida";

/**
 * Extract tracks from embedded JSON in lucida.to HTML.
 *
 * The HTML contains SvelteKit data in the format:
 * const data = [{...}, { data: { results: { results: { tracks: [...] } } } }];
 *
 * We use a bracket-counting parser because:
 * 1. Standard JSON.parse fails on partial JSON
 * 2. The JSON is embedded in JavaScript, not standalone
 *
 * Returns Effect that:
 * - Succeeds with tracks array (may be empty if no JSON block found)
 * - Fails with LucidaParseError if JSON parsing fails
 */
const extractTracksFromJson = (html: string, query: string) =>
  Effect.gen(function* () {
    const startMarker = "const data = [";
    const startIdx = html.indexOf(startMarker);

    yield* Effect.logDebug(
      `[JSON] Looking for marker "${startMarker}" - found at index: ${startIdx}`,
    );

    if (startIdx === -1) {
      // No JSON block found - not an error, just no embedded data
      yield* Effect.logDebug("[JSON] No JSON block found in HTML");
      return [];
    }

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

    yield* Effect.logDebug(
      `[JSON] Extracted JSON string (first 500 chars): ${jsonStr.slice(0, 500)}`,
    );
    yield* Effect.logDebug(`[JSON] JSON string length: ${jsonStr.length}`);

    // Wrap JSON.parse in Effect.try to properly fail on parse errors
    const data = yield* Effect.try({
      try: () => JSON.parse(jsonStr),
      catch: (e) =>
        new LucidaParseError({
          message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
          query,
          parseMethod: "json",
          cause: e,
        }),
    });

    yield* Effect.logDebug(
      `[JSON] Parsed data structure: ${JSON.stringify(Object.keys(data || {})).slice(0, 200)}`,
    );
    yield* Effect.logDebug(
      `[JSON] data[1] exists: ${!!data?.[1]}, data[1].data exists: ${!!data?.[1]?.data}`,
    );

    // Navigate: data[1].data.results.results.tracks
    const tracks = data?.[1]?.data?.results?.results?.tracks ?? [];

    yield* Effect.logDebug(`[JSON] Found ${tracks.length} tracks in JSON`);

    // biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown structure
    return tracks.map((track: any) => ({
      name: track.title ?? "",
      // biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown structure
      artist: (track.artists ?? []).map((a: any) => a.name).join(", "),
      album: track.album?.title ?? null,
      url: track.url ?? "",
    })) as LucidaTrack[];
  });

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
 *
 * Returns Effect that:
 * - Succeeds with tracks array (may be empty if no matches found)
 * - Fails with LucidaParseError if HTML structure is unexpected
 */
const extractTracksFromHtml = (html: string, query: string) =>
  Effect.gen(function* () {
    const tracks: LucidaTrack[] = [];

    yield* Effect.logDebug(
      `[HTML] Starting HTML parsing for query: "${query}"`,
    );
    yield* Effect.logDebug(
      `[HTML] HTML contains "search-result-track": ${html.includes("search-result-track")}`,
    );
    yield* Effect.logDebug(
      `[HTML] HTML contains "search-result": ${html.includes("search-result")}`,
    );
    yield* Effect.logDebug(
      `[HTML] HTML contains "No results": ${html.includes("No results")}`,
    );

    // Debug: show actual HTML around search-result-track to understand structure
    const trackClassIdx = html.indexOf("search-result-track");
    if (trackClassIdx !== -1) {
      // Get 500 chars before and 1000 chars after to see context
      const start = Math.max(0, trackClassIdx - 100);
      const end = Math.min(html.length, trackClassIdx + 1000);
      yield* Effect.logDebug(
        `[HTML] HTML around "search-result-track" (idx ${trackClassIdx}):\n${html.slice(start, end)}`,
      );
    }

    // Match track blocks - class contains "search-result-track" (may have other classes)
    // Structure: <div class="search-result-track ...">...<div class="metadata">...</div></div>
    // Use a more flexible regex that captures until the next track block or end of results
    const trackBlockRegex =
      /<div class="[^"]*search-result-track[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;

    const allMatches = [...html.matchAll(trackBlockRegex)];
    yield* Effect.logDebug(
      `[HTML] Found ${allMatches.length} track blocks with regex`,
    );

    for (const match of allMatches) {
      const block = match[1];
      if (!block) continue;

      yield* Effect.logDebug(
        `[HTML] Processing block (first 300 chars): ${block.slice(0, 300)}`,
      );

      // New structure: <a href="/?url=..."><h1>Track Name</h1></a>
      // The URL is in the <a> tag wrapping the <h1>, and contains a url= query param
      const titleLinkMatch =
        /<a href="([^"]*)"[^>]*>\s*<h1[^>]*>([^<]*)<\/h1>\s*<\/a>/i.exec(block);

      // Artist is in <h2>
      const artistMatch = /<h2[^>]*>([^<]*)<\/h2>/i.exec(block);

      // Album is in <h3> - may contain an <a> tag
      const albumMatch = /<h3[^>]*>(?:<a[^>]*>)?([^<]*)(?:<\/a>)?/i.exec(block);

      const linkHref = titleLinkMatch?.[1];
      const trackName = titleLinkMatch?.[2];

      yield* Effect.logDebug(
        `[HTML] Extracted - linkHref: ${linkHref}, trackName: ${trackName}, artist: ${artistMatch?.[1]}`,
      );

      if (linkHref && trackName) {
        // The href is like "/?url=http%3A%2F%2Fwww.tidal.com%2Ftrack%2F45474649"
        // We need the full lucida.to URL which will handle the redirect
        const trackUrl = linkHref.startsWith("http")
          ? linkHref
          : `https://lucida.to${linkHref}`;

        tracks.push({
          name: trackName.trim(),
          artist: artistMatch?.[1]?.trim() ?? "",
          album: albumMatch?.[1]?.trim() ?? null,
          url: trackUrl,
        });
      }
    }

    yield* Effect.logDebug(
      `[HTML] Extracted ${tracks.length} tracks from HTML`,
    );

    // If we found search-result elements but no track blocks, structure may have changed
    if (
      tracks.length === 0 &&
      html.includes("search-result") &&
      !html.includes("search-result-track") &&
      !html.includes("No results")
    ) {
      yield* Effect.logDebug(
        "[HTML] Structure mismatch: found 'search-result' but no 'search-result-track'",
      );
      return yield* Effect.fail(
        new LucidaParseError({
          message:
            "HTML structure changed - found 'search-result' but no 'search-result-track' elements",
          query,
          parseMethod: "html",
        }),
      );
    }

    return tracks;
  });

/**
 * Parse search results - try JSON first, fallback to HTML.
 *
 * Graceful degradation:
 * - If JSON succeeds with tracks, return them
 * - If JSON fails or returns empty, log warning and try HTML
 * - If HTML also fails, propagate the error
 * - If both return empty without errors, return empty (legitimate no results)
 */
const parseSearchResults = (html: string, query: string) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`[PARSE] Starting parse for query: "${query}"`);

    // Try JSON first
    const jsonResult = yield* extractTracksFromJson(html, query).pipe(
      Effect.catchTag("LucidaParseError", (jsonError) =>
        Effect.gen(function* () {
          // JSON failed - log warning and try HTML
          yield* Effect.logWarning(
            `JSON parsing failed for "${query}": ${jsonError.message}`,
          );

          yield* Effect.logDebug(
            "[PARSE] JSON failed, attempting HTML fallback",
          );

          // Try HTML fallback
          return yield* extractTracksFromHtml(html, query).pipe(
            Effect.catchTag("LucidaParseError", (htmlError) =>
              // Both failed - this is a real error
              Effect.fail(
                new LucidaParseError({
                  message: `Both parsers failed. JSON: ${jsonError.message}. HTML: ${htmlError.message}`,
                  query,
                  parseMethod: "both",
                  cause: { json: jsonError, html: htmlError },
                }),
              ),
            ),
          );
        }),
      ),
    );

    yield* Effect.logDebug(
      `[PARSE] JSON result: ${jsonResult.length} tracks (${jsonResult.length > 0 ? "success" : "empty"})`,
    );

    // If JSON succeeded with tracks, use them
    if (jsonResult.length > 0) {
      yield* Effect.logDebug("[PARSE] Using JSON results");
      return jsonResult;
    }

    // JSON returned empty - try HTML (might have results JSON missed)
    yield* Effect.logDebug(
      "[PARSE] JSON empty, trying HTML as additional check",
    );
    const htmlResult = yield* extractTracksFromHtml(html, query).pipe(
      // If HTML fails but JSON worked (returned empty), that's OK - return empty
      Effect.catchTag("LucidaParseError", () => Effect.succeed([])),
    );

    yield* Effect.logDebug(
      `[PARSE] HTML result: ${htmlResult.length} tracks (${htmlResult.length > 0 ? "success" : "empty"})`,
    );

    return htmlResult;
  });

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

        const url = `/search?service=tidal&country=US&query=${encodedQuery}`;
        yield* Effect.logDebug(`[LUCIDA] Request URL: ${url}`);

        const request = HttpClientRequest.get(url);

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

        yield* Effect.logDebug(`[LUCIDA] Response status: ${response.status}`);

        // Check for transient HTTP errors that should be retried
        // 404 can be transient on Lucida (server-side issues)
        // 5xx errors are server errors that may resolve on retry
        if (response.status === 404) {
          yield* Effect.logDebug(
            "[LUCIDA] Got 404 - treating as transient error, will retry",
          );
          return yield* Effect.fail(
            LucidaSearchError.make({
              message: `Transient 404 error - server may be overloaded`,
              isRateLimit: false,
              query,
            }),
          );
        }

        if (response.status >= 500) {
          yield* Effect.logDebug(
            `[LUCIDA] Got ${response.status} server error - will retry`,
          );
          return yield* Effect.fail(
            LucidaSearchError.make({
              message: `Server error ${response.status}`,
              isRateLimit: false,
              query,
            }),
          );
        }

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

        yield* Effect.logDebug(`[LUCIDA] Response body length: ${html.length}`);
        yield* Effect.logDebug(
          `[LUCIDA] Response body (first 1000 chars): ${html.slice(0, 1000)}`,
        );

        // Parse with proper error handling
        const tracks = yield* parseSearchResults(html, query);

        yield* Effect.logDebug(
          `[LUCIDA] Final result: ${tracks.length} tracks found`,
        );

        return tracks.slice(0, limit);
      });

      return { search };
    }),
  },
) {}
