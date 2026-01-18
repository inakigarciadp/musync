import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const verifyCommand = Command.make(
  "verify",
  {},
  Effect.fnUntraced(function* () {
    yield* Effect.logInfo("Verify not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync maintenance verify",
    });
  }),
).pipe(Command.withDescription("Check integrity"));
