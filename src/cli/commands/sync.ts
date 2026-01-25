import { Command } from "@effect/cli";
import { Effect } from "effect";
import type { PlaylistId } from "../../domain/models/youtube/playlist";
import { DatabaseService } from "../../services/database";
import { YouTubeService } from "../../services/youtube";

export const syncCommand = Command.make(
  "sync",
  {},
  Effect.fnUntraced(function* () {
    // This command will do quite a few things:
    // 1. Sync playlists and its tracks to our database. In the same database transaction we will:
    //   - Delete everything from the join table
    //   - Fetch all tracked playlists from the database
    //   - For each playlist, fetch its tracks from the API and insert them both in the tracks table and in the join table.
    // 2. Using GPT OSS 120B we will extract the song's name and artist from each track's title and channel, if it does not exist in our database yet.

    // 3. For each track, we will use a service to find the song in the download sources (maybe we will use GPT OSS 120B for that as well) and update the track record with the download URL.

    // 4. Finally, we will download all new tracks using the download URLs and store them in our local storage.
    const dbService = yield* DatabaseService;
    const youtube = yield* YouTubeService;

    yield* Effect.logInfo("Syncing all playlists");

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
              .onConflictDoUpdate({
                target: schema.tracks.id,
                set: {
                  title: schema.tracks.title,
                  channelTitle: schema.tracks.channelTitle,
                  publishedAt: schema.tracks.publishedAt,
                },
              })
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

    yield* Effect.logInfo("Sync completed successfully");
  }),
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
