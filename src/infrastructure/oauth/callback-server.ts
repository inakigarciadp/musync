import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { BunHttpServer } from "@effect/platform-bun";
import { Context, Effect, Layer, Queue } from "effect";
import { ServerStartError } from "../../domain/errors/auth";

class CallbackQueue extends Context.Tag("@oauth/callback-queue")<
  CallbackQueue,
  Queue.Queue<string>
>() {}

const handleCallback = Effect.gen(function* () {
  const queue = yield* CallbackQueue;
  const request = yield* HttpServerRequest.HttpServerRequest;

  const url = new URL(request.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return HttpServerResponse.html(
      `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`,
    ).pipe(HttpServerResponse.setStatus(400));
  }

  if (!code || !state) {
    return HttpServerResponse.html(
      "<html><body><h1>Invalid Callback</h1></body></html>",
    ).pipe(HttpServerResponse.setStatus(400));
  }

  yield* Queue.offer(queue, code);

  return HttpServerResponse.html(
    "<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>",
  );
});

export const acquireCallbackServer = Effect.gen(function* () {
  const queue = yield* Effect.acquireRelease(Queue.unbounded<string>(), (q) =>
    Queue.shutdown(q),
  );

  const serverLayer = BunHttpServer.layer({ port: 0 });

  const router = HttpRouter.empty.pipe(
    HttpRouter.get("/callback", handleCallback),
    HttpRouter.provideService(CallbackQueue, queue),
  );

  // Build the server layer explicitly in the current scope
  // This ensures we have a single instance of the server
  const serverContext = yield* Layer.build(serverLayer);
  const server = Context.get(serverContext, HttpServer.HttpServer);

  // Get the assigned port from the verified instance
  const port = server.address._tag === "TcpAddress" ? server.address.port : 0;

  // Launch the application using the SAME server instance
  yield* Layer.launch(HttpServer.serve(router)).pipe(
    Effect.provide(Layer.succeedContext(serverContext)),
    Effect.forkScoped,
  );

  return { port, queue };
}).pipe(
  Effect.catchAllCause((cause) =>
    ServerStartError.make({ message: "Failed to start server", cause: cause }),
  ),
);
