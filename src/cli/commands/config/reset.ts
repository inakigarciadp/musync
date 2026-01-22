import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const configResetCommand = Command.make(
  "reset",
  {},
  Effect.fnUntraced(function* () {
    yield* Effect.logInfo("Config reset not yet implemented");
    return yield* NotImplementedError.make({ command: "musync config reset" });
  }),
).pipe(Command.withDescription("Reset to defaults"));
