import { FileSystem } from "@effect/platform";
import { Config, Effect } from "effect";
import { FileSystemError } from "../domain/errors/auth";

export const CONFIG_FILE_NAME = "musync.config.json";

export class PathsService extends Effect.Service<PathsService>()(
  "PathsService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem; // Infrastructure - leaked OK

      const getHome = Effect.fn("PathsService.getHome")(function* () {
        return yield* Config.string("HOME").pipe(
          Config.orElse(() => Config.succeed("~")),
        );
      });

      const getDataHome = Effect.fn("PathsService.getDataHome")(function* () {
        const xdgDataHome = yield* Config.string("XDG_DATA_HOME").pipe(
          Config.orElse(() => Config.succeed(undefined)),
        );
        const home = yield* getHome();
        return xdgDataHome ?? `${home}/.local/share`;
      });

      const getConfigHome = Effect.fn("PathsService.getConfigHome")(
        function* () {
          const xdgConfigHome = yield* Config.string("XDG_CONFIG_HOME").pipe(
            Config.orElse(() => Config.succeed(undefined)),
          );
          const home = yield* getHome();
          return xdgConfigHome ?? `${home}/.config`;
        },
      );

      const getConfigDir = Effect.fn("PathsService.getConfigDir")(function* () {
        const configHome = yield* getConfigHome();
        return `${configHome}/musync`;
      });

      const getConfigFilePath = Effect.fn("PathsService.getConfigFilePath")(
        function* () {
          const configDir = yield* getConfigDir();
          return `${configDir}/${CONFIG_FILE_NAME}`;
        },
      );

      const getAppDataDir = Effect.fn("PathsService.getAppDataDir")(
        function* () {
          const dataHome = yield* getDataHome();
          const dir = `${dataHome}/musync`;

          yield* fs.makeDirectory(dir, { recursive: true }).pipe(
            Effect.mapError((error) =>
              FileSystemError.make({
                message: `Failed to create app data directory: ${error.message}`,
                path: dir,
              }),
            ),
          );

          return dir;
        },
      );

      const getMusicDir = Effect.fn("PathsService.getMusicDir")(function* () {
        // Try XDG_MUSIC_DIR first, fallback to ~/Music
        const xdgMusicDir = yield* Config.string("XDG_MUSIC_DIR").pipe(
          Config.orElse(() => Config.succeed(undefined)),
        );
        const home = yield* Config.string("HOME").pipe(
          Config.orElse(() => Config.succeed("~")),
        );

        const baseDir = xdgMusicDir ?? `${home}/Music`;
        const musicDir = `${baseDir}/musync`;

        // Ensure directory exists
        yield* fs.makeDirectory(musicDir, { recursive: true }).pipe(
          Effect.mapError((error) =>
            FileSystemError.make({
              message: `Failed to create music directory: ${error.message}`,
              path: musicDir,
            }),
          ),
        );

        return musicDir;
      });

      return {
        getHome,
        getDataHome,
        getConfigHome,
        getConfigDir,
        getConfigFilePath,
        getAppDataDir,
        getMusicDir,
      };
    }),
  },
) {}
