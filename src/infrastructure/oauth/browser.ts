import { Effect } from "effect";
import { BrowserOpenError } from "../../domain/errors/auth-errors";

export const openBrowser = Effect.fn("openBrowser")(function* (url: string) {
  const process = Bun.spawn(["open", url], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = yield* Effect.tryPromise({
    try: () => process.exited,
    catch: (error) => BrowserOpenError.make({ url, error }),
  });

  if (exitCode !== 0) {
    return yield* BrowserOpenError.make({
      url,
      error: `Process exited with code ${exitCode}`,
    });
  }

  return exitCode;
});
