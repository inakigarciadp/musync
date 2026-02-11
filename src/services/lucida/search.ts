import { type HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Ref } from "effect";
import {
  CloudflareChallengeError,
  LucidaParseError,
  LucidaSearchError,
} from "../../domain/errors/lucida";
import type { LucidaTrack } from "../../domain/models/lucida";

// --- HTML Parsing ---

/**
 * HTML parsing for lucida.to search results.
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
const extractTracksFromHtml = Effect.fn("extractTracksFromHtml")(function* (
  html: string,
  query: string,
) {
  const tracks: LucidaTrack[] = [];

  yield* Effect.logDebug(`[HTML] Starting HTML parsing for query: "${query}"`);
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

  const extractLucidaTargetUrl = (href: string): string | null => {
    const urlMatch = /[?&]url=([^&]+)/.exec(href);
    if (!urlMatch) {
      return null;
    }

    const encoded = urlMatch[1];
    if (!encoded) {
      return null;
    }

    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  };

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

    if (typeof linkHref === "string" && trackName) {
      // The href is like "/?url=http%3A%2F%2Fwww.tidal.com%2Ftrack%2F45474649"
      // Extract and decode the target URL (Tidal) from the lucida link
      const tidalUrl = extractLucidaTargetUrl(linkHref);

      if (!tidalUrl) {
        yield* Effect.logDebug(
          `[HTML] Skipping track - could not extract url param from: ${linkHref}`,
        );
        continue;
      }

      tracks.push({
        name: trackName.trim(),
        artist: artistMatch?.[1]?.trim() ?? "",
        album: albumMatch?.[1]?.trim() ?? null,
        url: tidalUrl,
      });
    }
  }

  yield* Effect.logDebug(`[HTML] Extracted ${tracks.length} tracks from HTML`);

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
    return yield* new LucidaParseError({
      message:
        "HTML structure changed - found 'search-result' but no 'search-result-track' elements",
      query,
      parseMethod: "html",
    });
  }

  return tracks;
});

/**
 * Parse search results from HTML.
 */
const parseSearchResults = Effect.fn("parseSearchResults")(function* (
  html: string,
  query: string,
) {
  yield* Effect.logDebug(`[PARSE] Starting HTML parse for query: "${query}"`);

  const htmlResult = yield* extractTracksFromHtml(html, query);

  yield* Effect.logDebug(
    `[PARSE] HTML result: ${htmlResult.length} tracks (${htmlResult.length > 0 ? "success" : "empty"})`,
  );

  return htmlResult;
});

// --- Search Factory ---

export interface SearchDeps {
  readonly http: HttpClient.HttpClient;
  readonly lastRequestTime: Ref.Ref<number>;
  readonly minRequestInterval: number;
}

export function createSearch(deps: SearchDeps) {
  return Effect.fn("LucidaService.search")(function* (
    songName: string,
    artistName: string,
    limit: number = 5,
  ) {
    // Rate limiting: wait if needed (using Ref for concurrency safety)
    const now = Date.now();
    const lastTime = yield* Ref.get(deps.lastRequestTime);
    const timeSinceLastRequest = now - lastTime;
    if (timeSinceLastRequest < deps.minRequestInterval) {
      yield* Effect.sleep(
        `${deps.minRequestInterval - timeSinceLastRequest} millis`,
      );
    }
    yield* Ref.set(deps.lastRequestTime, Date.now());

    const query = `${artistName} ${songName}`;
    const encodedQuery = encodeURIComponent(query);

    const url = `/search?service=tidal&country=US&query=${encodedQuery}`;
    yield* Effect.logDebug(`[LUCIDA] Request URL: ${url}`);

    const request = HttpClientRequest.get(url);

    const response = yield* deps.http.execute(request).pipe(
      Effect.mapError((e) =>
        LucidaSearchError.make({
          message: `HTTP request failed: ${e.message}`,
          cause: e,
          isRateLimit: e._tag === "ResponseError" && e.response.status === 429,
          query,
        }),
      ),
    );

    yield* Effect.logDebug(`[LUCIDA] Response status: ${response.status}`);

    // Check for transient HTTP errors that should be retried
    // 429 is rate limit - should wait before retrying
    // 404 can be transient on Lucida (server-side issues)
    // 5xx errors are server errors that may resolve on retry
    if (response.status === 429) {
      yield* Effect.logDebug("[LUCIDA] Got 429 - rate limited by Lucida");
      return yield* LucidaSearchError.make({
        message: "Rate limited by Lucida",
        isRateLimit: true,
        query,
      });
    }

    if (response.status === 404) {
      yield* Effect.logDebug(
        "[LUCIDA] Got 404 - treating as transient error, will retry",
      );
      return yield* LucidaSearchError.make({
        message: "Transient 404 error - server may be overloaded",
        isRateLimit: false,
        query,
      });
    }

    if (response.status >= 500) {
      yield* Effect.logDebug(
        `[LUCIDA] Got ${response.status} server error - will retry`,
      );
      return yield* LucidaSearchError.make({
        message: `Server error ${response.status}`,
        isRateLimit: false,
        query,
      });
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

    // Detect Cloudflare challenge: 403 status + "Just a moment..." in title
    if (
      response.status === 403 &&
      html.includes("<title>Just a moment...</title>")
    ) {
      yield* Effect.logDebug(
        "[LUCIDA] Detected Cloudflare challenge - user action required",
      );
      return yield* new CloudflareChallengeError({
        message: "Cloudflare verification required",
        url: "https://lucida.to",
      });
    }

    // Parse with proper error handling
    const tracks = yield* parseSearchResults(html, query);

    yield* Effect.logDebug(
      `[LUCIDA] Final result: ${tracks.length} tracks found`,
    );

    return tracks.slice(0, limit);
  });
}
