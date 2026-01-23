import { Args, Command } from "@effect/cli";
import { eq } from "drizzle-orm";
import { Console, Effect } from "effect";
import { PlaylistId } from "../../../domain/models/youtube/playlist";
import { DatabaseService } from "../../../services/database";

export const removePlaylistCommand = Command.make(
  "remove",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID to untrack"),
    ),
  },
  Effect.fnUntraced(function* ({ playlistId }: { playlistId: PlaylistId }) {
    const { runQuery, schema } = yield* DatabaseService;

    const deletionResult = yield* runQuery(async (db) => {
      return await db
        .delete(schema.playlists)
        .where(eq(schema.playlists.id, playlistId))
        .run();
    });

    if (deletionResult.rowsAffected > 0) {
      yield* Console.log(`✓ Stopped tracking playlist: ${playlistId}`);
    } else {
      yield* Console.log(`ℹ Playlist ${playlistId} was not being tracked.`);
    }
  }),
).pipe(Command.withDescription("Stop tracking playlist"));
