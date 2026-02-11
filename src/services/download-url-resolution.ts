import { Prompt } from "@effect/cli";
import { Terminal } from "@effect/platform";
import { and, count, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { Console, Effect, Schedule } from "effect";
import type { DownloadUrlMatchingError } from "../domain/errors/download-url-matching";
import { RateLimitExceededError, UrlParseError } from "../domain/errors/sync";
import type { LucidaTrack } from "../domain/models/lucida";
import { truncate } from "../presentation/formatters/utils";
import { DatabaseService } from "./database";
import { DownloadUrlMatchingService } from "./download-url-matching";
import { LucidaService } from "./lucida";

/**
 * Reason why user is being prompted for manual URL selection.
 * This provides context so user understands what happened.
 */
type PromptReason =
  | { type: "no_results" }
  | { type: "search_failed"; message: string }
  | { type: "parse_failed"; message: string }
  | { type: "ai_failed"; message: string }
  | { type: "ai_unsure" }
  | { type: "ai_invalid_index"; index: number };

export class DownloadUrlResolutionService extends Effect.Service<DownloadUrlResolutionService>()(
  "DownloadUrlResolutionService",
  {
    accessors: true,
    dependencies: [
      DatabaseService.Default,
      LucidaService.Default,
      DownloadUrlMatchingService.Default,
    ],
    effect: Effect.gen(function* () {
      const dbService = yield* DatabaseService;
      const lucida = yield* LucidaService;
      const downloadMatching = yield* DownloadUrlMatchingService;

      /**
       * Prompt user to select a download URL from search results.
       * Shows the reason why manual intervention is needed.
       * Returns the selected URL or null if skipped.
       */
      const promptForDownloadUrl = Effect.fn(
        "DownloadUrlResolutionService.promptForDownloadUrl",
      )(function* (
        song: { songName: string; artistName: string; title: string },
        searchResults: LucidaTrack[],
        reason: PromptReason,
      ) {
        yield* Console.log("");
        yield* Console.log(`Song: ${song.artistName} - ${song.songName}`);
        yield* Console.log(`Original YouTube: ${song.title}`);

        // Show reason for manual intervention
        yield* Console.log("");
        switch (reason.type) {
          case "no_results":
            yield* Console.log("No results found from Tidal.");
            break;
          case "search_failed":
            yield* Console.log(`Search failed: ${reason.message}`);
            break;
          case "parse_failed":
            yield* Console.log(
              `Could not parse search results: ${reason.message}`,
            );
            break;
          case "ai_failed":
            yield* Console.log(`AI matching failed: ${reason.message}`);
            break;
          case "ai_unsure":
            yield* Console.log("AI was not confident in any match.");
            break;
          case "ai_invalid_index":
            yield* Console.log(
              `AI returned invalid index ${reason.index} (out of bounds).`,
            );
            break;
        }

        // Build choices for Prompt.select
        type SelectValue =
          | { type: "select"; index: number }
          | { type: "manual" }
          | { type: "skip" }
          | { type: "not_downloadable" };

        const choices: Array<{
          title: string;
          value: SelectValue;
        }> = [];

        // Get terminal width to truncate choice titles and prevent wrapping.
        // @effect/cli's Prompt.select has a rendering bug where handleClear
        // doesn't account for wrapped lines, causing duplicate prompt lines.
        const terminal = yield* Terminal.Terminal;
        const columns = yield* terminal.columns;
        // 4 chars padding: 2 for pointer/space prefix (> ) + 2 safety margin
        const maxTitleLength = Math.max(columns - 4, 20);

        if (searchResults.length > 0) {
          yield* Console.log("\nSearch results from Tidal:");
          for (let i = 0; i < searchResults.length; i++) {
            const r = searchResults[i];
            if (r) {
              const title = `${i + 1}. ${r.name} by ${r.artist}${r.album ? ` (Album: ${r.album})` : ""}`;
              const choice: { title: string; value: SelectValue } = {
                title: truncate(title, maxTitleLength),
                value: { type: "select", index: i },
              };
              choices.push(choice);
            }
          }
        }

        choices.push({
          title: "Enter URL manually",
          value: { type: "manual" },
        });
        choices.push({
          title: "Skip this track",
          value: { type: "skip" },
        });
        choices.push({
          title: "Mark as non-downloadable (skip forever)",
          value: { type: "not_downloadable" },
        });

        const action = yield* Prompt.select({
          message: "Choose an action:",
          choices,
        });

        if (action.type === "select") {
          const selectedResult = searchResults[action.index];
          return selectedResult
            ? { type: "url" as const, url: selectedResult.url }
            : { type: "skip" as const };
        }
        if (action.type === "manual") {
          const url = yield* Prompt.text({
            message:
              "Enter Tidal track URL (lucida.to URLs will be converted, or leave empty to skip):",
          });
          const trimmed = url.trim();
          if (!trimmed) {
            return { type: "skip" as const };
          }

          // Normalize lucida.to URLs to Tidal URLs
          if (trimmed.startsWith("https://lucida.to/?url=")) {
            const match = /[?&]url=([^&]+)/.exec(trimmed);
            const encoded = match?.[1];
            if (encoded) {
              const decoded = yield* Effect.try({
                try: () => decodeURIComponent(encoded),
                catch: () =>
                  new UrlParseError({
                    message: "Failed to decode URL parameter",
                    url: trimmed,
                  }),
              });
              return { type: "url" as const, url: decoded };
            }
          }

          return { type: "url" as const, url: trimmed };
        }
        if (action.type === "not_downloadable") {
          return { type: "not_downloadable" as const };
        }
        return { type: "skip" as const };
      });

      // Constants for retry logic
      const MAX_RETRIES = 3;

      /**
       * Search lucida.to with retry logic.
       * Returns tracks on success, or a prompt reason on recoverable failure.
       * CloudflareChallengeError and rate limit exhaustion propagate up.
       */
      const searchWithRetry = Effect.fn(
        "DownloadUrlResolutionService.searchWithRetry",
      )(function* (songName: string, artistName: string) {
        const searchRetrySchedule = Schedule.exponential("2 seconds").pipe(
          Schedule.intersect(Schedule.recurs(MAX_RETRIES)),
        );

        return yield* lucida.search(songName, artistName, 5).pipe(
          Effect.tapError((e) =>
            Effect.logWarning(`Search failed: ${e.message}`),
          ),
          Effect.retry({
            schedule: searchRetrySchedule,
            while: (e) =>
              e._tag !== "CloudflareChallengeError" &&
              !(e._tag === "LucidaSearchError" && e.isRateLimit),
          }),
          Effect.map(
            (tracks) => ({ type: "success" as const, tracks }) as const,
          ),
          Effect.catchTag("LucidaSearchError", (e) =>
            e.isRateLimit
              ? Effect.fail(
                  new RateLimitExceededError({
                    message: `Lucida rate limited after ${MAX_RETRIES} retries`,
                    service: "lucida",
                    retryCount: MAX_RETRIES,
                  }),
                )
              : Effect.succeed({
                  type: "prompt" as const,
                  reason: {
                    type: "search_failed" as const,
                    message: e.message,
                  },
                  results: [] as LucidaTrack[],
                }),
          ),
          Effect.catchTag("LucidaParseError", (e) =>
            Effect.succeed({
              type: "prompt" as const,
              reason: {
                type: "parse_failed" as const,
                message: e.message,
              },
              results: [] as LucidaTrack[],
            }),
          ),
        );
      });

      /**
       * Use AI to pick the best match from search results.
       * Returns a URL on confident match, or a prompt reason if user intervention is needed.
       */
      const matchWithAi = Effect.fn("DownloadUrlResolutionService.matchWithAi")(
        function* (
          song: { songName: string; artistName: string },
          searchResults: LucidaTrack[],
        ) {
          const matchOutcome = yield* downloadMatching
            .pickBestMatch(song, searchResults)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `AI matching failed: ${e.message}${e.isRateLimit ? " (rate limited, waiting 60s)" : ""}`,
                ),
              ),
              Effect.retry(
                Schedule.exponential("2 seconds").pipe(
                  Schedule.intersect(Schedule.recurs(MAX_RETRIES)),
                  Schedule.intersect(
                    Schedule.identity<DownloadUrlMatchingError>(),
                  ),
                  Schedule.modifyDelay(([[duration, _], error], __) =>
                    error.isRateLimit ? "60 seconds" : duration,
                  ),
                ),
              ),
              Effect.map(
                (match) => ({ type: "success" as const, match }) as const,
              ),
              Effect.catchTag("DownloadUrlMatchingError", (e) =>
                Effect.succeed({ type: "ai_failed" as const, error: e }),
              ),
            );

          if (matchOutcome.type === "ai_failed") {
            return {
              type: "prompt" as const,
              reason: {
                type: "ai_failed" as const,
                message: matchOutcome.error.message,
              },
              results: searchResults,
            };
          }

          const { selectedIndex } = matchOutcome.match;

          if (selectedIndex === null) {
            yield* Effect.logInfo(
              "AI not confident, prompting for manual selection",
            );
            return {
              type: "prompt" as const,
              reason: { type: "ai_unsure" as const },
              results: searchResults,
            };
          }

          const selectedTrack = searchResults[selectedIndex];
          if (!selectedTrack) {
            yield* Effect.logWarning(
              `AI returned invalid index ${selectedIndex} for ${searchResults.length} results`,
            );
            return {
              type: "prompt" as const,
              reason: {
                type: "ai_invalid_index" as const,
                index: selectedIndex,
              },
              results: searchResults,
            };
          }

          yield* Effect.logInfo(
            `AI matched: ${selectedTrack.name} by ${selectedTrack.artist}`,
          );
          return { type: "url" as const, url: selectedTrack.url };
        },
      );

      /**
       * Find download URLs for songs via lucida.to
       *
       * For each song with songName + artistName but no downloadUrl:
       * 1. Search lucida.to (Tidal) for matching tracks
       * 2. Use AI to pick the best match
       * 3. If AI returns null or any step fails, prompt user with context
       * 4. Store the Tidal track URL in the database
       */
      const resolveAll = Effect.fn("DownloadUrlResolutionService.resolveAll")(
        function* () {
          const { schema, runQuery } = dbService;

          yield* Effect.logInfo("Finding download URLs for songs");

          // Track skipped songs in memory to avoid re-fetching them in this run
          const skippedTrackIds = new Set<string>();

          // Get count of songs needing download URL lookup
          const { total } = yield* runQuery(async (db) => {
            const result = await db
              .select({ total: count() })
              .from(schema.songs)
              .where(
                and(
                  isNull(schema.songs.downloadUrl),
                  isNotNull(schema.songs.songName),
                  isNotNull(schema.songs.artistName),
                  eq(schema.songs.extractionState, "finalized"),
                  or(
                    isNull(schema.songs.downloadable),
                    ne(schema.songs.downloadable, false),
                  ),
                ),
              );
            return result[0] ?? { total: 0 };
          });

          if (total === 0) {
            yield* Effect.logInfo("No songs need download URL lookup");
            return;
          }

          yield* Effect.logInfo(
            `Found ${total} songs needing download URL lookup`,
          );

          while (true) {
            // Get next song that needs download URL, excluding skipped ones
            const song = yield* runQuery(async (db) => {
              const results = await db
                .select({
                  trackId: schema.songs.trackId,
                  songName: schema.songs.songName,
                  artistName: schema.songs.artistName,
                  title: schema.tracks.title,
                })
                .from(schema.songs)
                .innerJoin(
                  schema.tracks,
                  eq(schema.songs.trackId, schema.tracks.id),
                )
                .where(
                  and(
                    isNull(schema.songs.downloadUrl),
                    isNotNull(schema.songs.songName),
                    isNotNull(schema.songs.artistName),
                    eq(schema.songs.extractionState, "finalized"),
                    or(
                      isNull(schema.songs.downloadable),
                      ne(schema.songs.downloadable, false),
                    ),
                  ),
                )
                .all();

              // Filter out skipped tracks in memory
              return (
                results.find((r) => !skippedTrackIds.has(r.trackId)) ?? null
              );
            });

            // No more songs to process
            if (!song) {
              break;
            }

            // Skip invalid songs (shouldn't happen due to WHERE clause, but be safe)
            if (!song.songName || !song.artistName) {
              continue;
            }

            yield* Effect.logInfo(
              `Searching for: ${song.artistName} - ${song.songName}`,
            );

            const songInfo = {
              songName: song.songName,
              artistName: song.artistName,
              title: song.title,
            };

            // Step 1: Search lucida.to
            const searchOutcome = yield* searchWithRetry(
              song.songName,
              song.artistName,
            );

            // Step 2: If search succeeded with results, try AI matching
            let resolution:
              | { type: "url"; url: string }
              | { type: "prompt"; reason: PromptReason; results: LucidaTrack[] }
              | null = null;

            if (searchOutcome.type === "prompt") {
              resolution = searchOutcome;
            } else if (searchOutcome.tracks.length === 0) {
              yield* Effect.logWarning(
                `No results found for: ${song.artistName} - ${song.songName}`,
              );
              resolution = {
                type: "prompt",
                reason: { type: "no_results" },
                results: [],
              };
            } else {
              resolution = yield* matchWithAi(songInfo, searchOutcome.tracks);
            }

            // Step 3: If we need user input, prompt now
            const result =
              resolution.type === "url"
                ? resolution
                : yield* promptForDownloadUrl(
                    songInfo,
                    resolution.results,
                    resolution.reason,
                  );

            // Step 4: Update database based on result
            if (result.type === "url") {
              yield* runQuery(async (db) => {
                await db
                  .update(schema.songs)
                  .set({ downloadUrl: result.url, downloadable: true })
                  .where(eq(schema.songs.trackId, song.trackId))
                  .run();
              });
              yield* Effect.logInfo(`Saved download URL for: ${song.songName}`);
            } else if (result.type === "not_downloadable") {
              yield* runQuery(async (db) => {
                await db
                  .update(schema.songs)
                  .set({ downloadable: false })
                  .where(eq(schema.songs.trackId, song.trackId))
                  .run();
              });
              yield* Effect.logInfo(
                `Marked as non-downloadable: ${song.songName}`,
              );
            } else {
              skippedTrackIds.add(song.trackId);
              yield* Effect.logInfo(`Skipped: ${song.songName}`);
            }
          }

          yield* Effect.logInfo("Download URL lookup completed");
        },
      );

      return { resolveAll };
    }),
  },
) {}
