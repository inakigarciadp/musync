import { FileSystem } from "@effect/platform";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { Effect, Ref, Schedule, Stream } from "effect";
import type {
  CloudflareChallengeError,
  LucidaDownloadError,
  LucidaDownloadTimeoutError,
} from "../domain/errors/lucida";
import { DatabaseService } from "./database";
import { LucidaService } from "./lucida";
import { UserConfigService } from "./user-config";

export class SongDownloadService extends Effect.Service<SongDownloadService>()(
  "SongDownloadService",
  {
    accessors: true,
    dependencies: [
      DatabaseService.Default,
      LucidaService.Default,
      UserConfigService.Default,
    ],
    effect: Effect.gen(function* () {
      const dbService = yield* DatabaseService;
      const lucida = yield* LucidaService;
      const userConfig = yield* UserConfigService;
      const fs = yield* FileSystem.FileSystem;

      /**
       * Download songs via lucida.to
       *
       * For each song with downloadUrl set but downloadedAt is NULL:
       * 1. Download the FLAC file from lucida.to
       * 2. Save to music directory
       * 3. Update downloadedAt in database
       */
      const downloadAll = Effect.fn("SongDownloadService.downloadAll")(
        function* () {
          const { schema, runQuery } = dbService;

          yield* Effect.logInfo("Downloading songs");

          // Get music directory (from user config, or XDG fallback)
          const musicDir = yield* userConfig.getEffectiveMusicDir();
          yield* Effect.logInfo(`Music directory: ${musicDir}`);

          // Get count of songs needing download
          const { total } = yield* runQuery(async (db) => {
            const result = await db
              .select({ total: count() })
              .from(schema.songs)
              .where(
                and(
                  isNotNull(schema.songs.downloadUrl),
                  isNull(schema.songs.downloadedAt),
                  eq(schema.songs.downloadable, true),
                ),
              );
            return result[0] ?? { total: 0 };
          });

          if (total === 0) {
            yield* Effect.logInfo("No songs need downloading");
            return;
          }

          yield* Effect.logInfo(`Found ${total} songs to download`);

          // Track attempted downloads in this sync run to avoid infinite loops
          // Failed tracks will be retried on the next sync command execution
          const attemptedTrackIds = new Set<string>();

          let downloaded = 0;
          let failed = 0;

          while (true) {
            // Get next song that needs downloading, excluding already attempted ones
            const song = yield* runQuery(async (db) => {
              const results = await db
                .select({
                  trackId: schema.songs.trackId,
                  songName: schema.songs.songName,
                  artistName: schema.songs.artistName,
                  downloadUrl: schema.songs.downloadUrl,
                })
                .from(schema.songs)
                .where(
                  and(
                    isNotNull(schema.songs.downloadUrl),
                    isNull(schema.songs.downloadedAt),
                    eq(schema.songs.downloadable, true),
                  ),
                )
                .all();

              // Filter out already attempted tracks
              return (
                results.find((r) => !attemptedTrackIds.has(r.trackId)) ?? null
              );
            });

            if (!song || !song.downloadUrl) {
              break;
            }

            // Mark as attempted immediately to avoid retrying in this run
            attemptedTrackIds.add(song.trackId);

            yield* Effect.logInfo(
              `Downloading: ${song.artistName ?? "Unknown"} - ${song.songName ?? "Unknown"}`,
            );

            // Download with dual retry strategy (shared budget of 5 retries):
            // - Rate-limit errors: 60s exponential backoff
            // - General retryable errors: 2s exponential backoff
            // - CloudflareChallengeError / non-retryable: never retry
            // Uses Schedule.union so each error type gets its own delay strategy,
            // with Schedule.intersect(recurs) enforcing a shared retry budget.
            const MAX_DOWNLOAD_RETRIES = 5;

            type DownloadError =
              | LucidaDownloadError
              | LucidaDownloadTimeoutError
              | CloudflareChallengeError;

            const isRateLimit = (e: DownloadError) =>
              e._tag === "LucidaDownloadError" && e.isRateLimit === true;
            const isRetryableGeneral = (e: DownloadError): boolean =>
              e._tag === "LucidaDownloadTimeoutError" ||
              (e._tag === "LucidaDownloadError" &&
                e.isRetryable === true &&
                e.isRateLimit !== true);
            const downloadSchedule = Schedule.union(
              Schedule.exponential("60 seconds").pipe(
                Schedule.whileInput(isRateLimit),
              ),
              Schedule.exponential("2 seconds").pipe(
                Schedule.whileInput(isRetryableGeneral),
              ),
            ).pipe(Schedule.intersect(Schedule.recurs(MAX_DOWNLOAD_RETRIES)));

            const downloadAttempt = yield* Ref.make(0);

            const downloadEffect = lucida.download(song.downloadUrl).pipe(
              Effect.tapError(
                Effect.fnUntraced(function* (e) {
                  const attempt = yield* Ref.getAndUpdate(
                    downloadAttempt,
                    (n) => n + 1,
                  );
                  const willRetry =
                    attempt < MAX_DOWNLOAD_RETRIES &&
                    (isRateLimit(e) || isRetryableGeneral(e));

                  if (isRateLimit(e)) {
                    const delay = 60 * 2 ** attempt;
                    yield* Effect.logWarning(
                      willRetry
                        ? `Download attempt failed: ${e.message} (rate-limited). Waiting ${delay}s before retry ${attempt + 1}/${MAX_DOWNLOAD_RETRIES}...`
                        : `Download attempt failed: ${e.message} (rate-limited)`,
                    );
                  } else {
                    yield* Effect.logWarning(
                      `Download attempt failed: ${e.message}`,
                    );
                  }
                }),
              ),
              Effect.retry(downloadSchedule),
            );

            const downloadResult = yield* downloadEffect.pipe(
              Effect.map((result) => ({ type: "success" as const, result })),
              // Catch download errors - these are handled here, not bubbled up
              Effect.catchTags({
                LucidaDownloadError: (e) =>
                  Effect.succeed({ type: "failed" as const, error: e }),
                LucidaDownloadTimeoutError: (e) =>
                  Effect.succeed({ type: "failed" as const, error: e }),
              }),
              // CloudflareChallengeError propagates up to CLI (already in AppError)
            );

            if (downloadResult.type === "failed") {
              yield* Effect.logError(
                `Failed to download ${song.songName}: ${downloadResult.error.message}`,
              );
              failed++;
              continue;
            }

            const { stream, filename } = downloadResult.result;
            const filePath = `${musicDir}/${filename}`;
            const partPath = `${filePath}.part`;

            // Write stream to file
            const saveResult = yield* Effect.gen(function* () {
              // Stream to file using fs.sink
              // stream is already Stream<Uint8Array, ResponseError>
              yield* Stream.run(stream, fs.sink(partPath));

              // Atomic rename
              yield* fs.rename(partPath, filePath);

              return { success: true as const };
            }).pipe(
              Effect.catchAll(
                Effect.fnUntraced(function* (e) {
                  // Clean up orphaned .part file
                  yield* fs
                    .remove(partPath)
                    .pipe(Effect.catchAll(() => Effect.void));
                  yield* Effect.logError(`Failed to save file: ${e}`);
                  return { success: false as const, error: e };
                }),
              ),
            );

            if (!saveResult.success) {
              failed++;
              continue;
            }

            // Update database
            yield* runQuery(async (db) => {
              await db
                .update(schema.songs)
                .set({ downloadedAt: new Date(), filename })
                .where(eq(schema.songs.trackId, song.trackId))
                .run();
            });

            downloaded++;
            yield* Effect.logInfo(`Downloaded: ${filename}`);
          }

          yield* Effect.logInfo(
            `Download complete: ${downloaded} succeeded, ${failed} failed`,
          );
        },
      );

      return { downloadAll };
    }),
  },
) {}
