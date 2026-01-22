import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";
import { PlaylistId } from "../../../domain/models/playlist";

export const removePlaylistCommand = Command.make(
  "remove",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID to untrack"),
    ),
  },
  Effect.fnUntraced(function* ({ playlistId }: { playlistId: string }) {
    yield* Effect.logInfo("Remove playlist not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync playlist remove",
    });
  }),
).pipe(Command.withDescription("Stop tracking playlist"));
