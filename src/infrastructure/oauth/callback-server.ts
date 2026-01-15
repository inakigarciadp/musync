import { Deferred, Effect, Queue } from "effect";
import {
  AuthTimeoutError,
  ServerStartError,
} from "../../domain/errors/auth-errors";

export type CallbackServer = {
  port: number;
  server: ReturnType<typeof Bun.serve>;
};

export const startCallbackServer = (queue: Queue.Queue<string>) =>
  Effect.gen(function* () {
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

            const success = await Effect.runPromise(Queue.offer(queue, code));
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

export const waitForAuthCode = (
  queue: Queue.Queue<string>,
  timeoutMs: number = 120000,
): Effect.Effect<string, AuthTimeoutError> =>
  Queue.take(queue).pipe(
    Effect.timeoutFail({
      duration: timeoutMs,
      onTimeout: () => AuthTimeoutError.make({ timeoutMs }),
    }),
  );

export const stopCallbackServer = (
  server: ReturnType<typeof Bun.serve>,
): Effect.Effect<void> => Effect.sync(() => server.stop());
