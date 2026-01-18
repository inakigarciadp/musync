import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const configSetCommand = Command.make(
  "set",
  {
    key: Args.text({ name: "key" }).pipe(
      Args.withDescription("Configuration key to set"),
    ),
    value: Args.text({ name: "value" }).pipe(
      Args.withDescription("Value to set"),
    ),
  },
  Effect.fnUntraced(function* ({ key, value }: { key: string; value: string }) {
    yield* Effect.logInfo("Config set not yet implemented");
    return yield* NotImplementedError.make({ command: "musync config set" });
  }),
).pipe(Command.withDescription("Set preference"));
