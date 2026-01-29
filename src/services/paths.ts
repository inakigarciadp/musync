import { FileSystem } from "@effect/platform";
import { Config, Effect } from "effect";
import { FileSystemError } from "../domain/errors/auth";

export class PathsService extends Effect.Service<PathsService>()(
  "PathsService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem; // Infrastructure - leaked OK

      const getDataHome = Effect.fn("PathsService.getDataHome")(function* () {
        const xdgDataHome = yield* Config.string("XDG_DATA_HOME").pipe(
          Config.orElse(() => Config.succeed(undefined)),
        );
        const home = yield* Config.string("HOME").pipe(
          Config.orElse(() => Config.succeed("~")),
        );
        return xdgDataHome ?? `${home}/.local/share`;
      });

      const getAppDataDir = Effect.fn("PathsService.getAppDataDir")(
        function* () {
          const dataHome = yield* getDataHome();
          const dir = `${dataHome}/musync`;

          yield* fs.makeDirectory(dir, { recursive: true }).pipe(
            Effect.mapError((error) =>
              FileSystemError.make({
                message: `Failed to create app data directory: ${error.message}`,
              }),
            ),
          );

          return dir;
        },
      );

      return { getDataHome, getAppDataDir };
    }),
  },
) {}
