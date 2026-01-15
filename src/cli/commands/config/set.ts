import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const configSetCommand = Command.make(
  "set",
  { key: Args.text({ name: "key" }), value: Args.text({ name: "value" }) },
  ({ key, value }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Config set not yet implemented");
      return yield* NotImplementedError.make({ command: "musync config set" });
    }),
).pipe(Command.withDescription("Set preference"));
