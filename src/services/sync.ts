import { Effect } from "effect";
import type { PlaylistId } from "../domain/models/youtube/playlist";
import { DatabaseService } from "./database";
import { YouTubeService } from "./youtube";

export class SyncService extends Effect.Service<SyncService>()("sync", {
  effect: Effect.gen(function* () {
    const dbService = yield* DatabaseService;
    const youtube = yield* YouTubeService;

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

    return {
      syncPlaylistsToDb,
    };
  }),
}) {}
