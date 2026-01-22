import { Command, Args } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const validateCommand = Command.make(
  "validate",
  { playlistId: Args.text({ name: "playlistId" }) },
  ({ playlistId }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Validate not yet implemented");
      return yield* NotImplementedError.make({
        command: "musync maintenance validate",
      });
    }),
).pipe(Command.withDescription("Verify playlist files"));
