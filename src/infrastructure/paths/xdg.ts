import fs from "node:fs/promises";
import { Config, Effect } from "effect";
import { FileSystemError } from "../../domain/errors/auth";

export const getDataHome = Effect.fn("getDataHome")(function* () {
  const xdgDataHome = yield* Config.string("XDG_DATA_HOME").pipe(
    Config.orElse(() => Config.succeed(undefined)),
  );
  const home = yield* Config.string("HOME").pipe(
    Config.orElse(() => Config.succeed("~")),
  );

  return xdgDataHome ?? `${home}/.local/share`;
});

export const getAppDataDir = Effect.fn("getAppDataDir")(function* () {
  const dataHome = yield* getDataHome();
  const dir = `${dataHome}/musync`;
  return yield* Effect.tryPromise({
    try: () => fs.mkdir(dir, { recursive: true }).then(() => dir),
    catch: (error) =>
      FileSystemError.make({
        reason: `Failed to create app data directory: ${error}`,
      }),
  });
});
