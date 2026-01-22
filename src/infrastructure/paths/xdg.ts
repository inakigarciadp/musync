import { promises as fs } from "node:fs";
import { Effect } from "effect";
import { FileSystemError } from "../../domain/errors/auth-errors";

export const getDataHome = Effect.sync(() => {
  return process.env.XDG_DATA_HOME ?? `${process.env.HOME}/.local/share`;
});

export const getAppDataDir = getDataHome.pipe(
  Effect.map((dataHome) => `${dataHome}/musync`),
  Effect.flatMap((dir) =>
    Effect.tryPromise({
      try: () => fs.mkdir(dir, { recursive: true }).then(() => dir),
      catch: (error) =>
        FileSystemError.make({
          reason: `Failed to create app data directory: ${error}`,
        }),
    }),
  ),
);
