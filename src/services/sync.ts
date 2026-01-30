import { Prompt } from "@effect/cli";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { Console, Effect, Schedule } from "effect";
import type { DownloadUrlMatchingError } from "../domain/errors/download-url-matching";
import type { LucidaSearchError } from "../domain/errors/lucida";
import type { SongExtractionError } from "../domain/errors/song-extraction";
import type { LucidaTrack } from "../domain/models/lucida";
import type { PlaylistId } from "../domain/models/youtube/playlist";
import { DatabaseService } from "./database";
import { DownloadUrlMatchingService } from "./download-url-matching";
import { LucidaService } from "./lucida";
import { SongExtractionService } from "./song-extraction";
import { YouTubeService } from "./youtube";

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
     * Returns the selected URL or null if skipped.
     */
    const promptForDownloadUrl = (
      song: { songName: string; artistName: string; title: string },
      searchResults: LucidaTrack[],
    ) =>
      Effect.gen(function* () {
        yield* Console.log("");
        yield* Console.log(`Song: ${song.artistName} - ${song.songName}`);
        yield* Console.log(`Original YouTube: ${song.title}`);

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
        } else {
          yield* Console.log("\nNo search results found from Tidal.");
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
      });

    /**
     * Step 5: Find download URLs for songs via lucida.to
     *
     * For each song with songName + artistName but no downloadUrl:
     * 1. Search lucida.to (Tidal) for matching tracks
     * 2. Use AI to pick the best match
     * 3. If AI returns null, prompt user immediately
     * 4. Store the Tidal track URL in the database
     *
     * Note: Skipped songs will reappear on next sync (downloadUrl stays null)
     */
    const findDownloadUrls = Effect.fn("SyncService.findDownloadUrls")(
      function* () {
        const { schema, runQuery } = dbService;

        yield* Effect.logInfo("Finding download URLs for songs");

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
          // Get next song that needs download URL
          const song = yield* runQuery(async (db) => {
            return await db
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
              .limit(1)
              .get();
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

          // Search lucida.to with retry
          const searchResults = yield* lucida
            .search(song.songName, song.artistName, 5)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(`Search failed: ${e.message}`),
              ),
              Effect.retry(
                Schedule.exponential("2 seconds").pipe(
                  Schedule.intersect(Schedule.recurs(3)),
                  Schedule.intersect(Schedule.identity<LucidaSearchError>()),
                  Schedule.modifyDelay(([[duration, _], error], __) =>
                    error.isRateLimit ? "60 seconds" : duration,
                  ),
                ),
              ),
              Effect.catchAll(() => Effect.succeed([] as LucidaTrack[])),
            );

          // Get download URL from AI or user prompt
          const downloadUrl: string | null = yield* searchResults.length === 0
            ? Effect.gen(function* () {
                yield* Effect.logWarning(
                  `No results found for: ${song.artistName} - ${song.songName}`,
                );
                return yield* promptForDownloadUrl(
                  {
                    songName: song.songName as string,
                    artistName: song.artistName as string,
                    title: song.title,
                  },
                  [],
                );
              })
            : Effect.gen(function* () {
                // Use AI to pick best match
                const match = yield* downloadMatching
                  .pickBestMatch(
                    {
                      songName: song.songName as string,
                      artistName: song.artistName as string,
                    },
                    searchResults,
                  )
                  .pipe(
                    Effect.tapError((e) =>
                      Effect.logWarning(`AI matching failed: ${e.message}`),
                    ),
                    Effect.retry(
                      Schedule.exponential("2 seconds").pipe(
                        Schedule.intersect(Schedule.recurs(3)),
                        Schedule.intersect(
                          Schedule.identity<DownloadUrlMatchingError>(),
                        ),
                        Schedule.modifyDelay(([[duration, _], error], __) =>
                          error.isRateLimit ? "60 seconds" : duration,
                        ),
                      ),
                    ),
                    Effect.catchAll(() =>
                      Effect.succeed({ selectedIndex: null }),
                    ),
                  );

                if (match.selectedIndex !== null) {
                  const selectedTrack = searchResults[match.selectedIndex];
                  if (selectedTrack) {
                    yield* Effect.logInfo(
                      `AI matched: ${selectedTrack.name} by ${selectedTrack.artist}`,
                    );
                    return selectedTrack.url;
                  }
                }

                // AI not confident - prompt user
                yield* Effect.logInfo(
                  "AI not confident, prompting for manual selection",
                );
                return yield* promptForDownloadUrl(
                  {
                    songName: song.songName as string,
                    artistName: song.artistName as string,
                    title: song.title,
                  },
                  searchResults,
                );
              });

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
