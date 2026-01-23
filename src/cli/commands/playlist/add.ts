import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { PlaylistId } from "../../../domain/models/youtube/playlist";
import { DatabaseService } from "../../../services/database";

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

    const results = yield* transaction(
      Effect.gen(function* () {
        const insertResults = [];
        for (const id of playlistIds) {
          const result = yield* runQuery(async (db) => {
            return await db
              .insert(schema.playlists)
              .values({ id })
              .onConflictDoNothing()
              .returning()
              .get();
          });
          insertResults.push({ id, inserted: !!result });
        }
        return insertResults;
      }),
    );

    for (const { id, inserted } of results) {
      if (inserted) {
        yield* Console.log(`✓ Started tracking playlist: ${id}`);
      } else {
        yield* Console.log(`ℹ Playlist ${id} is already being tracked`);
      }
    }
  }),
).pipe(Command.withDescription("Track playlists"));
