import { Effect } from "effect";
import { BrowserOpenError } from "../../domain/errors/auth-errors";

const getBrowserCommand = (): string[] => {
  const platform = process.platform;
  if (platform === "darwin") return ["open"];
  if (platform === "win32") return ["cmd", "/c", "start"];
  return ["xdg-open"];
};

export const openBrowser = Effect.fn("openBrowser")(function* (url: string) {
  const args = getBrowserCommand();

  const process = yield* Effect.try({
    try: () =>
      Bun.spawn([...args, url], {
        stdout: "pipe",
        stderr: "pipe",
      }),
    catch: (error) => BrowserOpenError.make({ url, error }),
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
