import { Effect, Queue, type Scope } from "effect";
import { ServerStartError } from "../../domain/errors/auth";

export type CallbackServer = {
  port: number | undefined;
  server: ReturnType<typeof Bun.serve>;
  queue: Queue.Queue<string>;
};

export const acquireCallbackServer: Effect.Effect<
  CallbackServer,
  ServerStartError,
  Scope.Scope
> = Effect.acquireRelease(
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<string>();

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
      queue,
    };
  }),
  Effect.fnUntraced(function* (resource, exit) {
    const exitTag = exit._tag;
    console.log(`Stopping callback server (${exitTag})...`);
    resource.server.stop();
    yield* Queue.shutdown(resource.queue);
  }),
);
