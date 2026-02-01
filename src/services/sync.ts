import { Prompt } from "@effect/cli";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { Console, Effect, Schedule } from "effect";
import type { DownloadUrlMatchingError } from "../domain/errors/download-url-matching";
import type {
  LucidaParseError,
  LucidaSearchError,
} from "../domain/errors/lucida";
import type { SongExtractionError } from "../domain/errors/song-extraction";
import { RateLimitExceededError } from "../domain/errors/sync";
import type { LucidaTrack } from "../domain/models/lucida";
import type { PlaylistId } from "../domain/models/youtube/playlist";
import { DatabaseService } from "./database";
import { DownloadUrlMatchingService } from "./download-url-matching";
import { LucidaService } from "./lucida";
import { SongExtractionService } from "./song-extraction";
import { YouTubeService } from "./youtube";

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

export class SyncService extends Effect.Service<SyncService>()("SyncService", {
  accessors: true,
  dependencies: [
    DatabaseService.Default,
    YouTubeService.Default,
    SongExtractionService.Default,
    LucidaService.Default,
    DownloadUrlMatchingService.Default,
  ],
  effect: Effect.gen(function* () {
    const dbService = yield* DatabaseService;
    const youtube = yield* YouTubeService;
    const songExtraction = yield* SongExtractionService;
    const lucida = yield* LucidaService;
    const downloadMatching = yield* DownloadUrlMatchingService;

    const syncPlaylistsToDb = Effect.fn("SyncService.syncPlaylistsToDb")(
      function* () {
        yield* Effect.logInfo("Syncing all playlists to database");

        yield* dbService.transaction(
          Effect.gen(function* () {
            const { schema, runQuery } = dbService;

            // 1. Delete everything from the join table
            yield* Effect.logDebug("Clearing playlist_tracks table");
            yield* runQuery(async (db) => {
              return await db.delete(schema.playlistTracks).run();
            });

            // 2. Fetch all tracked playlists from the database
            const trackedPlaylists = yield* runQuery(async (db) => {
              return await db.select().from(schema.playlists).all();
            });

            yield* Effect.logInfo(
              `Found ${trackedPlaylists.length} tracked playlists`,
            );

            for (const playlist of trackedPlaylists) {
              yield* Effect.logInfo(`Syncing playlist: ${playlist.id}`);

              // 3. For each playlist, fetch its tracks from the API
              const trackResponse = yield* youtube.listAllPlaylistItems(
                playlist.id as PlaylistId,
              );

              yield* Effect.logInfo(
                `Fetched ${trackResponse.items.length} tracks from YouTube`,
              );

              if (trackResponse.items.length === 0) {
                continue;
              }

              yield* runQuery(async (db) => {
                // 4. Upsert tracks into the tracks table
                const tracksToInsert = trackResponse.items.map((item) => ({
                  id: item.contentDetails.videoId as string,
                  title: item.snippet.title,
                  channelTitle:
                    item.snippet.videoOwnerChannelTitle ??
                    item.snippet.channelTitle,
                  publishedAt: item.contentDetails.videoPublishedAt,
                }));

                await db
                  .insert(schema.tracks)
                  .values(tracksToInsert)
                  .onConflictDoNothing()
                  .run();

                // 5. Insert into the join table
                const relationsToInsert = trackResponse.items.map((item) => ({
                  playlistId: playlist.id,
                  trackId: item.contentDetails.videoId as string,
                  position: item.snippet.position,
                  addedAt: item.snippet.publishedAt,
                }));

                await db
                  .insert(schema.playlistTracks)
                  .values(relationsToInsert)
                  .run();
              });
            }
          }),
        );

        yield* Effect.logInfo("Sync to database completed successfully");
      },
    );

    const extractSongsWithAi = Effect.fn("SyncService.extractSongsWithAi")(
      function* () {
        const { schema, runQuery } = dbService;

        yield* Effect.logInfo("Extracting song metadata using AI");

        // Get initial count for logging
        const { total } = yield* runQuery(async (db) => {
          const result = await db
            .select({ total: count() })
            .from(schema.tracks)
            .leftJoin(schema.songs, eq(schema.tracks.id, schema.songs.trackId))
            .where(isNull(schema.songs.trackId));
          return result[0] ?? { total: 0 };
        });

        yield* Effect.logInfo(`Found ${total} tracks needing extraction`);

        while (true) {
          // Get the next track that doesn't have a song entry yet
          const track = yield* runQuery(async (db) => {
            return await db
              .select({
                id: schema.tracks.id,
                title: schema.tracks.title,
                channelTitle: schema.tracks.channelTitle,
              })
              .from(schema.tracks)
              .leftJoin(
                schema.songs,
                eq(schema.tracks.id, schema.songs.trackId),
              )
              .where(isNull(schema.songs.trackId))
              .limit(1)
              .get();
          });

          if (!track) {
            break;
          }

          yield* Effect.logInfo(`Extracting metadata for: ${track.title}`);

          yield* Effect.gen(function* () {
            const result = yield* songExtraction
              .extractSongMetadata(track.title, track.channelTitle)
              .pipe(
                Effect.tapError((e) =>
                  Effect.logWarning(
                    `Retrying extraction for ${track.title} due to error: ${e.message}`,
                  ),
                ),
                Effect.retry(
                  Schedule.exponential("2 seconds").pipe(
                    Schedule.intersect(Schedule.recurs(5)),
                    Schedule.intersect(
                      Schedule.identity<SongExtractionError>(),
                    ),
                    Schedule.modifyDelay(([[duration, _], error], __) =>
                      error.isRateLimit ? "60 seconds" : duration,
                    ),
                  ),
                ),
              );

            yield* runQuery(async (db) => {
              const extractionState =
                result.songName && result.artistName
                  ? "finalized"
                  : "manual_review";

              await db
                .insert(schema.songs)
                .values({
                  trackId: track.id,
                  songName: result.songName,
                  artistName: result.artistName,
                  extractionState,
                })
                .run();
            });
          }).pipe(
            Effect.catchTags({
              SongExtractionError: (e) =>
                Effect.logError(
                  `Extraction permanently failed for ${track.title} after retries: ${e.message}`,
                ),
              DatabaseError: (e) =>
                Effect.logError(
                  `Database error for ${track.title} after retries: ${e.message}`,
                ),
            }),
          );
        }

        yield* Effect.logInfo("AI metadata extraction completed");
      },
    );

    const handleManualReview = Effect.fn("SyncService.handleManualReview")(
      function* () {
        const { schema, runQuery } = dbService;

        yield* Effect.logInfo("Checking for tracks needing manual review");

        // Get count of tracks needing manual review
        const { total } = yield* runQuery(async (db) => {
          const result = await db
            .select({ total: count() })
            .from(schema.songs)
            .where(eq(schema.songs.extractionState, "manual_review"));
          return result[0] ?? { total: 0 };
        });

        if (total === 0) {
          yield* Effect.logInfo("No tracks need manual review");
          return;
        }

        yield* Effect.logInfo(`Found ${total} track(s) needing manual review`);

        while (true) {
          // Get the next track that needs manual review
          const track = yield* runQuery(async (db) => {
            return await db
              .select({
                trackId: schema.songs.trackId,
                songName: schema.songs.songName,
                artistName: schema.songs.artistName,
                title: schema.tracks.title,
                channelTitle: schema.tracks.channelTitle,
              })
              .from(schema.songs)
              .innerJoin(
                schema.tracks,
                eq(schema.songs.trackId, schema.tracks.id),
              )
              .where(eq(schema.songs.extractionState, "manual_review"))
              .limit(1)
              .get();
          });

          if (!track) {
            break;
          }

          yield* Console.log("");
          yield* Console.log(
            `Reviewing: ${track.title}${track.channelTitle ? ` by ${track.channelTitle}` : ""}`,
          );
          yield* Console.log(
            `Current - Song: ${track.songName ?? "(empty)"}, Artist: ${track.artistName ?? "(empty)"}`,
          );

          const shouldEdit = yield* Prompt.confirm({
            message: "Do you want to edit these fields?",
          });

          let newSongName: string | null = track.songName;
          let newArtistName: string | null = track.artistName;

          if (shouldEdit) {
            const songNameInput = yield* Prompt.text({
              message: "Song name:",
              default: track.songName ?? "",
            });

            const artistNameInput = yield* Prompt.text({
              message: "Artist name:",
              default: track.artistName ?? "",
            });

            newSongName = songNameInput.trim() || null;
            newArtistName = artistNameInput.trim() || null;

            // Check if any field is empty and show warning
            if (!newSongName || !newArtistName) {
              yield* Console.warn(
                "Warning: If any field is left empty, this track won't be queued for download.",
              );

              const confirmContinue = yield* Prompt.confirm({
                message: "Continue with empty fields?",
              });

              if (!confirmContinue) {
                // User decided to go back and edit
                continue;
              }
            }
          }

          // Update the database - always mark as finalized after review
          yield* runQuery(async (db) => {
            await db
              .update(schema.songs)
              .set({
                songName: newSongName,
                artistName: newArtistName,
                extractionState: "finalized",
              })
              .where(eq(schema.songs.trackId, track.trackId))
              .run();
          });

          yield* Effect.logInfo(`Reviewed track: ${track.title}`);
        }

        yield* Effect.logInfo("Manual review process completed");
      },
    );

    /**
     * Prompt user to select a download URL from search results.
     * Shows the reason why manual intervention is needed.
     * Returns the selected URL or null if skipped.
     */
    const promptForDownloadUrl = Effect.fn("SyncService.promptForDownloadUrl")(
      function* (
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
          | { type: "skip" };

        const choices: Array<{
          title: string;
          value: SelectValue;
        }> = [];

        if (searchResults.length > 0) {
          yield* Console.log("\nSearch results from Tidal:");
          for (let i = 0; i < searchResults.length; i++) {
            const r = searchResults[i];
            if (r) {
              const choice: { title: string; value: SelectValue } = {
                title: `${i + 1}. ${r.name} by ${r.artist}${r.album ? ` (Album: ${r.album})` : ""}`,
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

        const action = yield* Prompt.select({
          message: "Choose an action:",
          choices,
        });

        if (action.type === "select") {
          const selectedResult = searchResults[action.index];
          return selectedResult ? selectedResult.url : null;
        }
        if (action.type === "manual") {
          const url = yield* Prompt.text({
            message: "Enter Tidal track URL (or leave empty to skip):",
          });
          return url.trim() || null;
        }
        return null as string | null;
      },
    );

    /**
     * Step 5: Find download URLs for songs via lucida.to
     *
     * For each song with songName + artistName but no downloadUrl:
     * 1. Search lucida.to (Tidal) for matching tracks
     * 2. Use AI to pick the best match
     * 3. If AI returns null or any step fails, prompt user with context
     * 4. Store the Tidal track URL in the database
     *
     * Error handling:
     * - HTTP/Parse errors: Retry, then prompt user with error message
     * - Rate limits: Retry with longer delay, fail sync if exceeded
     * - AI errors: Retry, then prompt user with error message
     * - AI returns null: Prompt user (AI was unsure, not an error)
     */
    const findDownloadUrls = Effect.fn("SyncService.findDownloadUrls")(
      function* () {
        const { schema, runQuery } = dbService;

        yield* Effect.logInfo("Finding download URLs for songs");

        // Track skipped songs in memory to avoid re-fetching them in this run
        const skippedTrackIds = new Set<string>();

        // Constants for retry logic
        const MAX_RETRIES = 3;

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
                ),
              )
              .all();

            // Filter out skipped tracks in memory
            return results.find((r) => !skippedTrackIds.has(r.trackId)) ?? null;
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

          // Search lucida.to with retry - proper error handling
          // Create a retry schedule that:
          // - Uses exponential backoff starting at 2 seconds
          // - Retries up to MAX_RETRIES times
          // - Only retries if NOT a rate limit error (rate limits should fail fast)
          const searchRetrySchedule = Schedule.exponential("2 seconds").pipe(
            Schedule.intersect(Schedule.recurs(MAX_RETRIES)),
            Schedule.whileInput((e: LucidaSearchError | LucidaParseError) =>
              e._tag === "LucidaSearchError" ? !e.isRateLimit : true,
            ),
          );

          const searchOutcome = yield* lucida
            .search(song.songName, song.artistName, 5)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(`Search failed: ${e.message}`),
              ),
              Effect.retry(searchRetrySchedule),
              // Map success to outcome type
              Effect.map((tracks) => ({ type: "success" as const, tracks })),
              // Handle errors after retries exhausted
              Effect.catchTag("LucidaSearchError", (e) =>
                e.isRateLimit
                  ? // Rate limit after retries - fail the sync
                    Effect.fail(
                      new RateLimitExceededError({
                        message: `Lucida rate limited after ${MAX_RETRIES} retries`,
                        service: "lucida",
                        retryCount: MAX_RETRIES,
                      }),
                    )
                  : // Other search error - prompt user
                    Effect.succeed({
                      type: "search_failed" as const,
                      error: e,
                    }),
              ),
              Effect.catchTag("LucidaParseError", (e) =>
                // Parse error - prompt user
                Effect.succeed({ type: "parse_failed" as const, error: e }),
              ),
            );

          // Handle search outcome
          let downloadUrl: string | null = null;

          if (searchOutcome.type === "search_failed") {
            // Search failed - prompt user with error context
            downloadUrl = yield* promptForDownloadUrl(
              {
                songName: song.songName,
                artistName: song.artistName,
                title: song.title,
              },
              [],
              { type: "search_failed", message: searchOutcome.error.message },
            );
          } else if (searchOutcome.type === "parse_failed") {
            // Parse failed - prompt user with error context
            downloadUrl = yield* promptForDownloadUrl(
              {
                songName: song.songName,
                artistName: song.artistName,
                title: song.title,
              },
              [],
              { type: "parse_failed", message: searchOutcome.error.message },
            );
          } else {
            // Search succeeded
            const searchResults = searchOutcome.tracks;

            if (searchResults.length === 0) {
              // No results found - prompt user
              yield* Effect.logWarning(
                `No results found for: ${song.artistName} - ${song.songName}`,
              );
              downloadUrl = yield* promptForDownloadUrl(
                {
                  songName: song.songName,
                  artistName: song.artistName,
                  title: song.title,
                },
                [],
                { type: "no_results" },
              );
            } else {
              // Have results - use AI to pick best match
              const matchOutcome = yield* downloadMatching
                .pickBestMatch(
                  {
                    songName: song.songName,
                    artistName: song.artistName,
                  },
                  searchResults,
                )
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
                      // Wait 60 seconds on rate limit, otherwise use exponential backoff
                      Schedule.modifyDelay(([[duration, _], error], __) =>
                        error.isRateLimit ? "60 seconds" : duration,
                      ),
                    ),
                  ),
                  // Map success to outcome type
                  Effect.map((match) => ({
                    type: "success" as const,
                    match,
                  })),
                  // Handle errors after retries exhausted - prompt user
                  Effect.catchTag("DownloadUrlMatchingError", (e) =>
                    Effect.succeed({
                      type: "ai_failed" as const,
                      error: e,
                    }),
                  ),
                );

              if (matchOutcome.type === "ai_failed") {
                // AI failed - prompt user with error context
                downloadUrl = yield* promptForDownloadUrl(
                  {
                    songName: song.songName,
                    artistName: song.artistName,
                    title: song.title,
                  },
                  searchResults,
                  { type: "ai_failed", message: matchOutcome.error.message },
                );
              } else {
                // AI succeeded
                const match = matchOutcome.match;

                if (match.selectedIndex !== null) {
                  // AI found a confident match
                  const selectedTrack = searchResults[match.selectedIndex];
                  if (selectedTrack) {
                    yield* Effect.logInfo(
                      `AI matched: ${selectedTrack.name} by ${selectedTrack.artist}`,
                    );
                    downloadUrl = selectedTrack.url;
                  } else {
                    // AI returned invalid index - prompt user
                    yield* Effect.logWarning(
                      `AI returned invalid index ${match.selectedIndex} for ${searchResults.length} results`,
                    );
                    downloadUrl = yield* promptForDownloadUrl(
                      {
                        songName: song.songName,
                        artistName: song.artistName,
                        title: song.title,
                      },
                      searchResults,
                      { type: "ai_invalid_index", index: match.selectedIndex },
                    );
                  }
                } else {
                  // AI returned null - not an error, just unsure
                  yield* Effect.logInfo(
                    "AI not confident, prompting for manual selection",
                  );
                  downloadUrl = yield* promptForDownloadUrl(
                    {
                      songName: song.songName,
                      artistName: song.artistName,
                      title: song.title,
                    },
                    searchResults,
                    { type: "ai_unsure" },
                  );
                }
              }
            }
          }

          // Update database only if we have a URL (skipped songs stay null)
          if (downloadUrl) {
            yield* runQuery(async (db) => {
              await db
                .update(schema.songs)
                .set({ downloadUrl })
                .where(eq(schema.songs.trackId, song.trackId))
                .run();
            });
            yield* Effect.logInfo(`Saved download URL for: ${song.songName}`);
          } else {
            // Track skipped song to avoid re-fetching in this run
            skippedTrackIds.add(song.trackId);
            yield* Effect.logInfo(`Skipped: ${song.songName}`);
          }
        }

        yield* Effect.logInfo("Download URL lookup completed");
      },
    );

    return {
      syncPlaylistsToDb,
      extractSongsWithAi,
      handleManualReview,
      findDownloadUrls,
    };
  }),
}) {}
