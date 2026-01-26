import { eq, isNull } from "drizzle-orm";
import { Effect, Schedule } from "effect";
import type { SongExtractionError } from "../domain/errors/song-extraction";
import type { PlaylistId } from "../domain/models/youtube/playlist";
import { DatabaseService } from "./database";
import { SongExtractionService } from "./song-extraction";
import { YouTubeService } from "./youtube";

export class SyncService extends Effect.Service<SyncService>()("sync", {
  effect: Effect.gen(function* () {
    const dbService = yield* DatabaseService;
    const youtube = yield* YouTubeService;
    const songExtraction = yield* SongExtractionService;

    const syncPlaylistsToDb = Effect.gen(function* () {
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
    });

    const extractSongsWithAi = Effect.gen(function* () {
      const { schema, runQuery } = dbService;

      yield* Effect.logInfo("Extracting song metadata using AI");

      // Get tracks that don't have song entries yet
      const tracksWithoutSongs = yield* runQuery(async (db) => {
        return await db
          .select({
            id: schema.tracks.id,
            title: schema.tracks.title,
            channelTitle: schema.tracks.channelTitle,
          })
          .from(schema.tracks)
          .leftJoin(schema.songs, eq(schema.tracks.id, schema.songs.trackId))
          .where(isNull(schema.songs.trackId))
          .all();
      });

      yield* Effect.logInfo(
        `Found ${tracksWithoutSongs.length} tracks needing extraction`,
      );

      for (const track of tracksWithoutSongs) {
        yield* Effect.logInfo(`Extracting metadata for: ${track.title}`);

        yield* Effect.gen(function* () {
          const result = yield* songExtraction
            .extractSongMetadata(track.title, track.channelTitle)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `Retrying extraction for ${track.title} due to error: ${e.reason}`,
                ),
              ),
              Effect.retry(
                Schedule.exponential("2 seconds").pipe(
                  Schedule.intersect(Schedule.recurs(5)),
                  Schedule.intersect(Schedule.identity<SongExtractionError>()),
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
          Effect.catchAll((e) =>
            Effect.logError(
              `Extraction permanently failed for ${track.title} after retries: ${e.reason}`,
            ),
          ),
        );
      }

      yield* Effect.logInfo("AI metadata extraction completed");
    });

    return {
      syncPlaylistsToDb,
      extractSongsWithAi,
    };
  }),
}) {}
