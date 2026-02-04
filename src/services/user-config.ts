import { FileSystem } from "@effect/platform";
import { Effect, Schema } from "effect";
import { FileSystemError } from "../domain/errors/auth";
import {
  ConfigNotFoundError,
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
} from "../domain/errors/config";
import {
  isValidConfigKey,
  UserConfig,
  ValidConfigKeys,
} from "../domain/models/user-config";
import { PathsService } from "./paths";

export class UserConfigService extends Effect.Service<UserConfigService>()(
  "UserConfigService",
  {
    accessors: true,
    dependencies: [PathsService.Default],
    effect: Effect.gen(function* () {
      const paths = yield* PathsService;
      const fs = yield* FileSystem.FileSystem;

      const read = Effect.fn("UserConfigService.read")(function* () {
        const configPath = yield* paths.getConfigFilePath();

        const exists = yield* fs.exists(configPath).pipe(
          Effect.mapError((e) =>
            ConfigReadError.make({
              message: `Failed to check if config file exists: ${e.message}`,
              path: configPath,
            }),
          ),
        );
        if (!exists) {
          return yield* ConfigNotFoundError.make({
            message: "Config file not found. Run 'musync init' to initialize.",
            path: configPath,
          });
        }

        const content = yield* fs.readFileString(configPath).pipe(
          Effect.mapError((e) =>
            ConfigReadError.make({
              message: `Failed to read config file: ${e.message}`,
              path: configPath,
            }),
          ),
        );

        const json = yield* Effect.try({
          try: () => JSON.parse(content),
          catch: (e) =>
            ConfigReadError.make({
              message: `Invalid JSON in config file: ${e instanceof Error ? e.message : String(e)}`,
              path: configPath,
            }),
        });

        return yield* Schema.decodeUnknown(UserConfig)(json).pipe(
          Effect.mapError((e) =>
            ConfigReadError.make({
              message: `Invalid config structure: ${e.message}`,
              path: configPath,
            }),
          ),
        );
      });

      const write = Effect.fn("UserConfigService.write")(function* (
        config: UserConfig,
      ) {
        const configPath = yield* paths.getConfigFilePath();
        const configDir = yield* paths.getConfigDir();

        // Ensure config directory exists
        yield* fs.makeDirectory(configDir, { recursive: true }).pipe(
          Effect.mapError((e) =>
            ConfigWriteError.make({
              message: `Failed to create config directory: ${e.message}`,
              path: configDir,
            }),
          ),
        );

        const content = JSON.stringify(config, null, 2);

        yield* fs.writeFileString(configPath, content).pipe(
          Effect.mapError((e) =>
            ConfigWriteError.make({
              message: `Failed to write config file: ${e.message}`,
              path: configPath,
            }),
          ),
        );
      });

      const set = Effect.fn("UserConfigService.set")(function* (
        key: string,
        value: string,
      ) {
        if (!isValidConfigKey(key)) {
          return yield* ConfigValidationError.make({
            message: `Invalid config key '${key}'. Valid keys: ${ValidConfigKeys.join(", ")}`,
            key,
          });
        }

        // Validate outputDirectory exists if that's what we're setting
        if (key === "outputDirectory") {
          const exists = yield* fs.exists(value).pipe(
            Effect.mapError(() =>
              ConfigValidationError.make({
                message: `Cannot access path: ${value}`,
                key,
              }),
            ),
          );
          if (!exists) {
            return yield* ConfigValidationError.make({
              message: `Directory does not exist: ${value}`,
              key,
            });
          }

          const stat = yield* fs.stat(value).pipe(
            Effect.mapError(() =>
              ConfigValidationError.make({
                message: `Cannot access directory: ${value}`,
                key,
              }),
            ),
          );

          if (stat.type !== "Directory") {
            return yield* ConfigValidationError.make({
              message: `Path is not a directory: ${value}`,
              key,
            });
          }
        }

        // Validate cerebrasModel is non-empty
        if (key === "cerebrasModel" && value.trim() === "") {
          return yield* ConfigValidationError.make({
            message: "cerebrasModel cannot be empty",
            key,
          });
        }

        const currentConfig = yield* read();

        const updatedConfig = new UserConfig({
          ...currentConfig,
          [key]: value,
        });

        yield* write(updatedConfig);

        return updatedConfig;
      });

      const getCerebrasModel = Effect.fn("UserConfigService.getCerebrasModel")(
        function* () {
          const config = yield* read();
          return config.cerebrasModel;
        },
      );

      const getOutputDirectory = Effect.fn(
        "UserConfigService.getOutputDirectory",
      )(function* () {
        const config = yield* read();
        return config.outputDirectory;
      });

      /**
       * Returns the effective music directory:
       * 1. If outputDirectory is set in config, use that
       * 2. Otherwise, fall back to XDG music directory (via PathsService.getMusicDir)
       */
      const getEffectiveMusicDir = Effect.fn(
        "UserConfigService.getEffectiveMusicDir",
      )(function* () {
        const config = yield* read();
        if (config.outputDirectory !== null) {
          // Ensure the configured directory exists
          const outputDir = config.outputDirectory;
          yield* fs.makeDirectory(outputDir, { recursive: true }).pipe(
            Effect.mapError((e) =>
              FileSystemError.make({
                message: `Failed to create output directory: ${e.message}`,
                path: outputDir,
              }),
            ),
          );
          return config.outputDirectory;
        }
        // Fall back to XDG music directory
        return yield* paths.getMusicDir();
      });

      return {
        read,
        write,
        set,
        getCerebrasModel,
        getOutputDirectory,
        getEffectiveMusicDir,
      };
    }),
  },
) {}
