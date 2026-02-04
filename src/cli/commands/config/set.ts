import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { ValidConfigKeys } from "../../../domain/models/user-config";
import { UserConfigService } from "../../../services/user-config";

export const configSetCommand = Command.make(
  "set",
  {
    key: Args.text({ name: "key" }).pipe(
      Args.withDescription(
        `Configuration key to set (${ValidConfigKeys.join(", ")})`,
      ),
    ),
    value: Args.text({ name: "value" }).pipe(
      Args.withDescription("Value to set"),
    ),
  },
  Effect.fnUntraced(function* ({ key, value }: { key: string; value: string }) {
    const userConfig = yield* UserConfigService;
    yield* userConfig.set(key, value);
    yield* Console.log(`Set ${key} = ${value}`);
  }),
).pipe(Command.withDescription("Set preference"));
