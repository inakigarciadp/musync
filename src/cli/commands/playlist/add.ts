import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { PlaylistId } from "../../../domain/models/youtube/playlist";
import { DatabaseService } from "../../../services/database";
import { YouTubeService } from "../../../services/youtube";

export const addPlaylistCommand = Command.make(
  "add",
  {
    playlistIds: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.repeated,
      Args.withDescription("YouTube playlist IDs to track"),
    ),
  },
  Effect.fnUntraced(function* ({ playlistIds }: { playlistIds: PlaylistId[] }) {
    const { transaction, runQuery, schema } = yield* DatabaseService;
    const youtube = yield* YouTubeService;

    const results = yield* transaction(
      Effect.gen(function* () {
        const insertResults = [];
        for (const id of playlistIds) {
          // Fetch playlist name from YouTube first — fail early if invalid
          const playlistMeta = yield* youtube.getPlaylist(id);
          const name = playlistMeta.snippet.title;

          const result = yield* runQuery(async (db) => {
            return await db
              .insert(schema.playlists)
              .values({ id, name })
              .onConflictDoNothing()
              .returning()
              .get();
          });

          insertResults.push({ id, name, inserted: !!result });
        }
        return insertResults;
      }),
    );

    for (const { id, name, inserted } of results) {
      if (inserted) {
        yield* Console.log(`✓ Started tracking playlist: ${name} (${id})`);
      } else {
        yield* Console.log(`ℹ Playlist ${id} is already being tracked`);
      }
    }
  }),
).pipe(Command.withDescription("Track playlists"));
