import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";
import { PlaylistId } from "../../../domain/models/youtube/playlist";

export const refetchCommand = Command.make(
  "refetch",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID to refetch"),
    ),
  },
  Effect.fnUntraced(function* ({ playlistId }: { playlistId: string }) {
    yield* Effect.logInfo("Refetch not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync maintenance refetch",
    });
  }),
).pipe(Command.withDescription("Re-fetch metadata"));
