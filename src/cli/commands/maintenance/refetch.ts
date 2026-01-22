import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const refetchCommand = Command.make(
  "refetch",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withDescription("YouTube playlist ID to refetch"),
    ),
  },
  ({ playlistId }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Refetch not yet implemented");
      return yield* NotImplementedError.make({
        command: "musync maintenance refetch",
      });
    }),
).pipe(Command.withDescription("Re-fetch metadata"));
