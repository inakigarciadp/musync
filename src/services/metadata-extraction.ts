import { Prompt } from "@effect/cli";
import { count, eq, isNull } from "drizzle-orm";
import { Console, Effect, Schedule } from "effect";
import type { SongExtractionError } from "../domain/errors/song-extraction";
import { DatabaseService } from "./database";
import { SongExtractionService } from "./song-extraction";

export class MetadataExtractionService extends Effect.Service<MetadataExtractionService>()(
  "MetadataExtractionService",
  {
    accessors: true,
    dependencies: [DatabaseService.Default, SongExtractionService.Default],
    effect: Effect.gen(function* () {
      const dbService = yield* DatabaseService;
      const songExtraction = yield* SongExtractionService;

      /**
       * Extract song metadata (name, artist) from track titles using AI.
       * Processes all tracks that don't have a song entry yet.
       */
      const extractAll = Effect.fn("MetadataExtractionService.extractAll")(
        function* () {
          const { schema, runQuery } = dbService;

          yield* Effect.logInfo("Extracting song metadata using AI");

          // Get initial count for logging
          const { total } = yield* runQuery(async (db) => {
            const result = await db
              .select({ total: count() })
              .from(schema.tracks)
              .leftJoin(
                schema.songs,
                eq(schema.tracks.id, schema.songs.trackId),
              )
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

      /**
       * Interactive manual review for tracks where AI extraction was incomplete.
       * Prompts user for song name and artist for each track needing review.
       */
      const handleManualReview = Effect.fn(
        "MetadataExtractionService.handleManualReview",
      )(function* () {
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
      });

      return { extractAll, handleManualReview };
    }),
  },
) {}
