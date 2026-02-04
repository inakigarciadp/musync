import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Ref } from "effect";
import {
  CloudflareChallengeError,
  LucidaDownloadError,
  LucidaDownloadTimeoutError,
  LucidaParseError,
  LucidaSearchError,
} from "../domain/errors/lucida";
import type { LucidaTrack } from "../domain/models/lucida";

// --- Domain Models for Download ---

interface LucidaPageData {
  token: string;
  tokenExpiry: number;
  trackUrl: string; // The actual track URL from the page data
}

interface TrackDownloadResponse {
  handoff: string;
  server: string;
}

interface DownloadStatus {
  status: string;
  message: string;
}

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

export class LucidaService extends Effect.Service<LucidaService>()(
  "LucidaService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      // Thread-safe state for rate limiting (last request timestamp)
      const lastRequestTime = yield* Ref.make(0);
      const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

      const search = Effect.fn("LucidaService.search")(function* (
        songName: string,
        artistName: string,
        limit: number = 5,
      ) {
        // Rate limiting: wait if needed (using Ref for concurrency safety)
        const now = Date.now();
        const lastTime = yield* Ref.get(lastRequestTime);
        const timeSinceLastRequest = now - lastTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
          yield* Effect.sleep(
            `${MIN_REQUEST_INTERVAL - timeSinceLastRequest} millis`,
          );
        }
        yield* Ref.set(lastRequestTime, Date.now());

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
        // 429 is rate limit - should wait before retrying
        // 404 can be transient on Lucida (server-side issues)
        // 5xx errors are server errors that may resolve on retry
        if (response.status === 429) {
          yield* Effect.logDebug("[LUCIDA] Got 429 - rate limited by Lucida");
          return yield* LucidaSearchError.make({
            message: `Rate limited by Lucida`,
            isRateLimit: true,
            query,
          });
        }

        if (response.status === 404) {
          yield* Effect.logDebug(
            "[LUCIDA] Got 404 - treating as transient error, will retry",
          );
          return yield* LucidaSearchError.make({
            message: `Transient 404 error - server may be overloaded`,
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

      /**
       * Download a track from lucida.to
       *
       * Flow:
       * 1. Fetch the lucida page to get CSRF token and track metadata
       * 2. POST to /api/load to initiate download, get handoff ID
       * 3. Poll status endpoint until "completed"
       * 4. Stream the audio file
       *
       * @param lucidaUrl - The lucida.to URL (e.g., https://lucida.to/?url=...)
       * @returns Stream of Uint8Array chunks and the filename
       */
      const download = Effect.fn("LucidaService.download")(function* (
        lucidaUrl: string,
      ) {
        yield* Effect.logDebug(
          `[DOWNLOAD] ========== Starting download flow ==========`,
        );
        yield* Effect.logDebug(`[DOWNLOAD] Lucida URL: ${lucidaUrl}`);

        // Rate limiting
        const now = Date.now();
        const lastTime = yield* Ref.get(lastRequestTime);
        const timeSinceLastRequest = now - lastTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
          const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
          yield* Effect.logDebug(
            `[DOWNLOAD] Rate limiting: waiting ${waitTime}ms`,
          );
          yield* Effect.sleep(`${waitTime} millis`);
        }
        yield* Ref.set(lastRequestTime, Date.now());

        // Step 1: Fetch page and extract CSRF token
        yield* Effect.logDebug(`[DOWNLOAD] Step 1: Fetching page data...`);
        const pageData = yield* fetchPageData(lucidaUrl);
        yield* Effect.logDebug(
          `[DOWNLOAD] Step 1 complete: got token and trackUrl`,
        );

        // Step 2: Initiate download
        yield* Effect.logDebug(`[DOWNLOAD] Step 2: Initiating download...`);
        const downloadInfo = yield* initiateDownload(pageData);
        yield* Effect.logDebug(
          `[DOWNLOAD] Step 2 complete: got handoff=${downloadInfo.handoff}, server=${downloadInfo.server}`,
        );

        // Step 3: Poll until completed
        yield* Effect.logDebug(`[DOWNLOAD] Step 3: Polling for completion...`);
        yield* pollUntilCompleted(downloadInfo);
        yield* Effect.logDebug(`[DOWNLOAD] Step 3 complete: download ready`);

        // Step 4: Return stream and filename
        yield* Effect.logDebug(`[DOWNLOAD] Step 4: Getting download stream...`);
        const result = yield* streamDownload(downloadInfo);
        yield* Effect.logDebug(
          `[DOWNLOAD] Step 4 complete: filename=${result.filename}`,
        );

        yield* Effect.logDebug(
          `[DOWNLOAD] ========== Download flow complete ==========`,
        );

        return result;
      });

      // Helper: Fetch page and extract CSRF token + track URL
      const fetchPageData = Effect.fn("LucidaService.fetchPageData")(function* (
        lucidaUrl: string,
      ) {
        yield* Effect.logDebug(
          `[DOWNLOAD] Fetching page data from: ${lucidaUrl}`,
        );

        const request = HttpClientRequest.get(lucidaUrl);

        const response = yield* http.execute(request).pipe(
          Effect.mapError(
            (e) =>
              new LucidaDownloadError({
                message: `Failed to fetch page: ${e.message}`,
                trackUrl: lucidaUrl,
                phase: "init",
                cause: e,
                isRetryable: true,
              }),
          ),
        );

        yield* Effect.logDebug(
          `[DOWNLOAD] Page response status: ${response.status}`,
        );

        const html = yield* response.text.pipe(
          Effect.mapError(
            (e) =>
              new LucidaDownloadError({
                message: `Failed to read response: ${e.message}`,
                trackUrl: lucidaUrl,
                phase: "init",
                cause: e,
                isRetryable: true,
              }),
          ),
        );

        yield* Effect.logDebug(
          `[DOWNLOAD] Page HTML length: ${html.length} chars`,
        );
        yield* Effect.logDebug(
          `[DOWNLOAD] Page HTML (first 500 chars): ${html.slice(0, 500)}`,
        );

        // Check for Cloudflare challenge
        if (
          response.status === 403 &&
          html.includes("<title>Just a moment...</title>")
        ) {
          yield* Effect.logDebug(
            "[DOWNLOAD] Detected Cloudflare challenge page",
          );
          return yield* new CloudflareChallengeError({
            message: "Cloudflare verification required",
            url: "https://lucida.to",
          });
        }

        // Extract JSON data between markers (same approach as lucidaDownloader)
        // Markers: `,{"type":"data","data":` ... `,"uses":{"url":1}}];`
        const startMarker = ',{"type":"data","data":';
        const endMarker = ',"uses":{"url":1}}];';

        const startIdx = html.indexOf(startMarker);
        yield* Effect.logDebug(
          `[DOWNLOAD] Looking for start marker "${startMarker}" - found at index: ${startIdx}`,
        );

        if (startIdx === -1) {
          yield* Effect.logDebug(
            `[DOWNLOAD] Start marker not found. HTML contains 'type":"data"': ${html.includes('type":"data"')}`,
          );
          yield* Effect.logDebug(
            `[DOWNLOAD] HTML around potential data area (searching for "const data"): ${html.includes("const data") ? "found" : "not found"}`,
          );
          return yield* new LucidaDownloadError({
            message:
              "Could not find page data in HTML (start marker not found)",
            trackUrl: lucidaUrl,
            phase: "init",
            isRetryable: false,
          });
        }

        const jsonStart = startIdx + startMarker.length;
        const endIdx = html.indexOf(endMarker, jsonStart);
        yield* Effect.logDebug(
          `[DOWNLOAD] Looking for end marker "${endMarker}" - found at index: ${endIdx}`,
        );

        if (endIdx === -1) {
          yield* Effect.logDebug(
            `[DOWNLOAD] End marker not found. Searching for alternative markers...`,
          );
          yield* Effect.logDebug(
            `[DOWNLOAD] HTML contains ',"uses":': ${html.includes(',"uses":')}`,
          );
          yield* Effect.logDebug(
            `[DOWNLOAD] JSON area (first 1000 chars from start): ${html.slice(jsonStart, jsonStart + 1000)}`,
          );
          return yield* new LucidaDownloadError({
            message: "Could not find page data in HTML (end marker not found)",
            trackUrl: lucidaUrl,
            phase: "init",
            isRetryable: false,
          });
        }

        const rawStr = html.slice(jsonStart, endIdx);
        yield* Effect.logDebug(
          `[DOWNLOAD] Extracted raw string length: ${rawStr.length}`,
        );
        yield* Effect.logDebug(
          `[DOWNLOAD] Raw string (first 500 chars): ${rawStr.slice(0, 500)}`,
        );
        yield* Effect.logDebug(
          `[DOWNLOAD] Raw string (last 200 chars): ${rawStr.slice(-200)}`,
        );

        // Convert JavaScript object literal notation to valid JSON
        // SvelteKit embeds data as JS objects with unquoted keys: {key: value}
        // We need to quote the keys to make it valid JSON: {"key": value}
        // This regex matches unquoted keys (word characters followed by colon)
        // but only when they appear after { or , (not inside strings)
        const jsonStr = rawStr.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

        yield* Effect.logDebug(
          `[DOWNLOAD] Converted to JSON (first 500 chars): ${jsonStr.slice(0, 500)}`,
        );

        // Parse the JSON using Effect.try
        // biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown structure
        const data: any = yield* Effect.try({
          try: () => JSON.parse(jsonStr),
          catch: (e) =>
            new LucidaDownloadError({
              message: `Failed to parse page data JSON: ${e}`,
              trackUrl: lucidaUrl,
              phase: "init",
              cause: e,
              isRetryable: false,
            }),
        }).pipe(
          Effect.tap(() =>
            Effect.logDebug(
              `[DOWNLOAD] JSON parsed successfully. Keys: ${Object.keys(JSON.parse(jsonStr)).join(", ")}`,
            ),
          ),
          Effect.tapError((e) =>
            Effect.logDebug(
              `[DOWNLOAD] JSON parse failed. Error: ${e.message}\n[DOWNLOAD] JSON string (first 2000 chars): ${jsonStr.slice(0, 2000)}`,
            ),
          ),
        );

        // Extract token, tokenExpiry, and track URL
        // Structure for single track: { info: { type: "track", url, ... }, token, tokenExpiry }
        // Note: For single tracks, the CSRF token comes from PageData.token, NOT from track data
        // (see lucidaDownloader models.rs - AlbumInfo::new() where token is passed separately)
        const token = data.token;
        const tokenExpiry = data.tokenExpiry;

        yield* Effect.logDebug(
          `[DOWNLOAD] Extracted token: ${token ? `${token.slice(0, 20)}...` : "null"}`,
        );
        yield* Effect.logDebug(
          `[DOWNLOAD] Extracted tokenExpiry: ${tokenExpiry}`,
        );
        yield* Effect.logDebug(
          `[DOWNLOAD] data.info type: ${data.info?.type}, data.info exists: ${!!data.info}`,
        );

        // Handle both Info::Track format (type: "track") and nested track object
        const trackInfo =
          data.info?.type === "track"
            ? data.info
            : (data.info?.track ?? data.info);
        const trackUrl = trackInfo?.url;

        yield* Effect.logDebug(`[DOWNLOAD] Extracted trackUrl: ${trackUrl}`);

        if (!token || !tokenExpiry || !trackUrl) {
          yield* Effect.logDebug(
            `[DOWNLOAD] Missing required fields - token: ${!!token}, tokenExpiry: ${!!tokenExpiry}, trackUrl: ${!!trackUrl}`,
          );
          yield* Effect.logDebug(
            `[DOWNLOAD] Full data structure: ${JSON.stringify(data, null, 2).slice(0, 2000)}`,
          );
          return yield* new LucidaDownloadError({
            message: "Missing required fields in page data",
            trackUrl: lucidaUrl,
            phase: "init",
            isRetryable: false,
          });
        }

        yield* Effect.logDebug(
          `[DOWNLOAD] Successfully extracted page data - token: ${token.slice(0, 10)}..., trackUrl: ${trackUrl}`,
        );

        return { token, tokenExpiry, trackUrl };
      });

      // Helper: Initiate download via POST /api/load
      const initiateDownload = Effect.fn("LucidaService.initiateDownload")(
        function* (pageData: LucidaPageData) {
          yield* Effect.logDebug(
            `[DOWNLOAD] Initiating download for track: ${pageData.trackUrl}`,
          );

          const requestBody = {
            account: { id: "US", type: "country" },
            compat: false,
            downscale: "original",
            handoff: true,
            metadata: true, // Embed metadata in FLAC
            private: true, // Hide from recent downloads
            token: {
              expiry: pageData.tokenExpiry,
              primary: pageData.token,
              secondary: null,
            },
            upload: { enabled: false },
            url: pageData.trackUrl,
          };

          yield* Effect.logDebug(
            `[DOWNLOAD] POST /api/load request body: ${JSON.stringify(requestBody, null, 2)}`,
          );

          const request = HttpClientRequest.post(
            "https://lucida.to/api/load?url=%2Fapi%2Ffetch%2Fstream%2Fv2",
          ).pipe(HttpClientRequest.bodyUnsafeJson(requestBody));

          const response = yield* http.execute(request).pipe(
            Effect.mapError(
              (e) =>
                new LucidaDownloadError({
                  message: `Failed to initiate download: ${e.message}`,
                  trackUrl: pageData.trackUrl,
                  phase: "init",
                  cause: e,
                  isRetryable: true,
                }),
            ),
          );

          yield* Effect.logDebug(
            `[DOWNLOAD] /api/load response status: ${response.status}`,
          );

          // biome-ignore lint/suspicious/noExplicitAny: JSON response has unknown structure
          const body: any = yield* response.json.pipe(
            Effect.mapError(
              (e) =>
                new LucidaDownloadError({
                  message: `Failed to parse download response: ${e.message}`,
                  trackUrl: pageData.trackUrl,
                  phase: "init",
                  cause: e,
                  isRetryable: true,
                }),
            ),
          );

          yield* Effect.logDebug(
            `[DOWNLOAD] /api/load response body: ${JSON.stringify(body, null, 2)}`,
          );

          if (body.error) {
            yield* Effect.logDebug(
              `[DOWNLOAD] Server returned error: ${body.error}`,
            );
            return yield* new LucidaDownloadError({
              message: `Server error: ${body.error}`,
              trackUrl: pageData.trackUrl,
              phase: "init",
              isRetryable: false,
            });
          }

          if (!body.handoff || !body.server) {
            yield* Effect.logDebug(
              `[DOWNLOAD] Missing handoff/server - handoff: ${body.handoff}, server: ${body.server}`,
            );
            return yield* new LucidaDownloadError({
              message: "Missing handoff or server in response",
              trackUrl: pageData.trackUrl,
              phase: "init",
              isRetryable: false,
            });
          }

          yield* Effect.logDebug(
            `[DOWNLOAD] Got handoff: ${body.handoff}, server: ${body.server}`,
          );

          return { handoff: body.handoff, server: body.server };
        },
      );

      // Helper: Poll status endpoint until completed
      const pollUntilCompleted = Effect.fn("LucidaService.pollUntilCompleted")(
        function* (downloadInfo: TrackDownloadResponse) {
          const statusUrl = `https://${downloadInfo.server}.lucida.to/api/fetch/request/${downloadInfo.handoff}`;
          const POLL_INTERVAL = 1000; // 1 second
          const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes timeout
          const STUCK_THRESHOLD = 60 * 1000; // 60 seconds same status = stuck

          yield* Effect.logDebug(
            `[DOWNLOAD] Starting to poll status at: ${statusUrl}`,
          );

          const startTime = Date.now();
          let lastStatus: { status: string; time: number } | null = null;
          let pollCount = 0;

          while (true) {
            pollCount++;
            const elapsed = Date.now() - startTime;

            if (elapsed > MAX_POLL_TIME) {
              yield* Effect.logDebug(
                `[DOWNLOAD] Poll timeout after ${elapsed}ms (${pollCount} polls)`,
              );
              return yield* new LucidaDownloadTimeoutError({
                message: "Download processing timed out after 5 minutes",
                trackUrl: statusUrl,
                timeoutMs: MAX_POLL_TIME,
              });
            }

            const request = HttpClientRequest.get(statusUrl);

            const response = yield* http.execute(request).pipe(
              Effect.tapError((e) =>
                Effect.logDebug(
                  `[DOWNLOAD] Poll request failed (will retry): ${e.message}`,
                ),
              ),
              Effect.catchAll(() => Effect.succeed(null)), // Ignore errors, retry
            );

            if (response && response.status === 200) {
              const body = (yield* response.json.pipe(
                Effect.catchAll(() => Effect.succeed(null)),
              )) as DownloadStatus | null;

              if (body) {
                yield* Effect.logDebug(
                  `[DOWNLOAD] Poll #${pollCount}: status=${body.status}, message=${body.message}`,
                );

                // Check if completed
                if (body.status === "completed") {
                  yield* Effect.logDebug(
                    `[DOWNLOAD] Download completed after ${pollCount} polls (${elapsed}ms)`,
                  );
                  return;
                }

                // Check if stuck on same status
                if (lastStatus && lastStatus.status === body.status) {
                  const stuckTime = Date.now() - lastStatus.time;
                  if (stuckTime > STUCK_THRESHOLD) {
                    yield* Effect.logDebug(
                      `[DOWNLOAD] Download stuck on "${body.status}" for ${stuckTime}ms`,
                    );
                    return yield* new LucidaDownloadError({
                      message: `Download stuck on status "${body.status}" for 60+ seconds`,
                      trackUrl: statusUrl,
                      phase: "poll",
                      isRetryable: true,
                    });
                  }
                } else {
                  lastStatus = { status: body.status, time: Date.now() };
                }
              } else {
                yield* Effect.logDebug(
                  `[DOWNLOAD] Poll #${pollCount}: got 200 but failed to parse body`,
                );
              }
            } else if (response && response.status === 500) {
              yield* Effect.logDebug(
                `[DOWNLOAD] Poll #${pollCount}: server returned 500`,
              );
              // Server error - fail and let retry logic handle it
              return yield* new LucidaDownloadError({
                message: "Server returned 500 during status check",
                trackUrl: statusUrl,
                phase: "poll",
                isRetryable: true,
              });
            } else {
              yield* Effect.logDebug(
                `[DOWNLOAD] Poll #${pollCount}: response status=${response?.status ?? "null"}`,
              );
            }

            yield* Effect.sleep(`${POLL_INTERVAL} millis`);
          }
        },
      );

      // Helper: Stream the download
      // Returns an Effect Stream that can be piped to a file sink
      const streamDownload = Effect.fn("LucidaService.streamDownload")(
        function* (downloadInfo: TrackDownloadResponse) {
          const downloadUrl = `https://${downloadInfo.server}.lucida.to/api/fetch/request/${downloadInfo.handoff}/download`;

          yield* Effect.logDebug(
            `[DOWNLOAD] Starting file download from: ${downloadUrl}`,
          );

          const request = HttpClientRequest.get(downloadUrl);

          const response = yield* http.execute(request).pipe(
            Effect.mapError(
              (e) =>
                new LucidaDownloadError({
                  message: `Failed to start download stream: ${e.message}`,
                  trackUrl: downloadUrl,
                  phase: "stream",
                  cause: e,
                  isRetryable: true,
                }),
            ),
          );

          yield* Effect.logDebug(
            `[DOWNLOAD] Download response status: ${response.status}`,
          );

          if (response.status !== 200) {
            yield* Effect.logDebug(
              `[DOWNLOAD] Unexpected status code: ${response.status}`,
            );
            return yield* new LucidaDownloadError({
              message: `Download returned status ${response.status}`,
              trackUrl: downloadUrl,
              phase: "stream",
              isRetryable: true,
            });
          }

          // Get filename from Content-Disposition header
          // Try RFC 5987 format first: filename*=UTF-8''encoded_name
          // Then standard format: filename="name"
          // Headers are normalized to lowercase in @effect/platform
          const contentDisposition =
            response.headers["content-disposition"] ?? "";

          yield* Effect.logDebug(
            `[DOWNLOAD] Content-Disposition header: ${contentDisposition}`,
          );

          let filename = "track.flac";

          // Try RFC 5987 format
          const rfc5987Match = /filename\*=UTF-8''([^;\s]+)/i.exec(
            contentDisposition,
          );
          if (rfc5987Match?.[1]) {
            filename = decodeURIComponent(rfc5987Match[1]);
            yield* Effect.logDebug(
              `[DOWNLOAD] Extracted filename (RFC 5987): ${filename}`,
            );
          } else {
            // Try standard format
            const standardMatch = /filename=['"]?([^'";]+)['"]?/i.exec(
              contentDisposition,
            );
            if (standardMatch?.[1]) {
              filename = standardMatch[1];
              yield* Effect.logDebug(
                `[DOWNLOAD] Extracted filename (standard): ${filename}`,
              );
            } else {
              yield* Effect.logDebug(
                `[DOWNLOAD] Could not extract filename, using default: ${filename}`,
              );
            }
          }

          // Sanitize filename (remove path separators)
          filename = filename.replace(/[/\\]/g, "_");

          yield* Effect.logDebug(
            `[DOWNLOAD] Final filename (sanitized): ${filename}`,
          );

          // response.stream is Stream<Uint8Array, ResponseError>
          return { stream: response.stream, filename };
        },
      );

      return { search, download };
    }),
  },
) {}
