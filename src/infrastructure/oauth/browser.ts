import { Effect } from "effect";
import { BrowserOpenError } from "../../domain/errors/auth-errors";

export const openBrowser = Effect.fn("openBrowser")(function* (url: string) {
  return yield* Effect.tryPromise({
    try: () =>
      Bun.spawn(["open", url], {
        stdout: "pipe",
        stderr: "pipe",
      }).exited.then((exitCode) => {
        if (exitCode !== 0) {
          throw new Error(`Browser open command exited with code ${exitCode}`);
        }
      }),
    catch: (error) => BrowserOpenError.make({ url, error }),
  });
});
