import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { DEFAULT_CEREBRAS_MODEL } from "../../../domain/models/user-config";
import { PathsService } from "../../../services/paths";
import { UserConfigService } from "../../../services/user-config";

export const configShowCommand = Command.make(
  "show",
  {},
  Effect.fnUntraced(function* () {
    const userConfig = yield* UserConfigService;
    const paths = yield* PathsService;

    const config = yield* userConfig.read();
    const configPath = yield* paths.getConfigFilePath();

    yield* Console.log(`Config file: ${configPath}`);
    yield* Console.log("");
    yield* Console.log(
      `cerebrasModel:    ${config.cerebrasModel}${config.cerebrasModel === DEFAULT_CEREBRAS_MODEL ? " (default)" : ""}`,
    );
    yield* Console.log(
      `outputDirectory:  ${config.outputDirectory ?? "(uses XDG music directory)"}`,
    );
  }),
).pipe(Command.withDescription("Display config"));
