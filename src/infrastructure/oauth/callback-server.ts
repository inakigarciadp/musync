import { Effect, Queue } from "effect";
import { AuthTimeoutError, ServerStartError } from "../../domain/errors/auth";

export type CallbackServer = {
  port: number | undefined;
  server: ReturnType<typeof Bun.serve>;
};

export const startCallbackServer = Effect.fn("startCallbackServer")(function* (
  queue: Queue.Queue<string>,
) {
  const server = yield* Effect.try({
    try: () =>
      Bun.serve({
        port: 0,
        async fetch(req) {
          const url = new URL(req.url);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          if (error) {
            return new Response(
              `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`,
              {
                status: 400,
                headers: { "Content-Type": "text/html" },
              },
            );
          }

          if (!code || !state) {
            return new Response(
              `<html><body><h1>Invalid Callback</h1></body></html>`,
              {
                status: 400,
                headers: { "Content-Type": "text/html" },
              },
            );
          }

          const success = Queue.unsafeOffer(queue, code);
          if (success) {
            return new Response(
              `<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>`,
              {
                status: 200,
                headers: { "Content-Type": "text/html" },
              },
            );
          }

          return new Response(
            `<html><body><h1>Authorization Failed</h1></body></html>`,
            {
              status: 500,
              headers: { "Content-Type": "text/html" },
            },
          );
        },
      }),
    catch: (error) => ServerStartError.make({ error }),
  });

  return {
    port: server.port,
    server,
  };
});

export const waitForAuthCode = Effect.fn("waitForAuthCode")(function* (
  queue: Queue.Queue<string>,
  timeoutMs: number = 120000,
) {
  return yield* Queue.take(queue).pipe(
    Effect.timeoutFail({
      duration: timeoutMs,
      onTimeout: () => AuthTimeoutError.make({ timeoutMs }),
    }),
  );
});

export const stopCallbackServer = Effect.fn("stopCallbackServer")(
  (server: ReturnType<typeof Bun.serve>) => Effect.sync(() => server.stop()),
);
