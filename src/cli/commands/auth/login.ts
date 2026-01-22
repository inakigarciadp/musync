import { Command } from "@effect/cli";
import { Console, Effect, Queue } from "effect";
import { openBrowser } from "../../../infrastructure/oauth/browser";
import {
  startCallbackServer,
  stopCallbackServer,
  waitForAuthCode,
} from "../../../infrastructure/oauth/callback-server";
import { AuthService } from "../../../services/auth";

export const loginCommand = Command.make("login", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Starting OAuth2 authentication flow...");

    const auth = yield* AuthService;

    const pkce = yield* auth.generatePKCEPair;

    const queue = yield* Queue.unbounded<string>();

    const { server, port } = yield* startCallbackServer(queue).pipe(
      Effect.catchTag("ServerStartError", (error) =>
        Effect.gen(function* () {
          yield* Console.error(
            `Failed to start OAuth callback server: ${error.error}`,
          );
          yield* Console.error(
            "Please ensure port 3000 is available or check your firewall settings.",
          );
          return yield* Effect.fail(new Error("Server start failed"));
        }),
      ),
    );

    const redirectUri = `http://localhost:${port}/callback`;

    yield* Console.log(`Starting callback server on port ${port}...`);

    const authUrl = yield* auth.buildAuthorizationUrl({
      codeChallenge: pkce.codeChallenge,
      state: pkce.state,
      redirectUri,
    });

    yield* Console.log("Opening browser for authorization...");

    const browserResult = yield* openBrowser(authUrl).pipe(
      Effect.catchTag("BrowserOpenError", (error) =>
        Effect.gen(function* () {
          yield* Console.warn("Could not open browser automatically.");
          yield* Console.log(`Please visit this URL: ${authUrl}`);
          return error;
        }),
      ),
      Effect.orElse(() => Effect.succeed(undefined)),
    );

    if (browserResult) {
      yield* Console.warn("Browser open failed, but continuing...");
    } else {
      yield* Console.log(
        "Browser opened. Complete authorization in your browser.",
      );
    }

    yield* Console.log(
      "Waiting for authorization callback (timeout: 2 minutes)...",
    );

    const code = yield* waitForAuthCode(queue, 120000).pipe(
      Effect.catchTag("AuthTimeoutError", (error) =>
        Effect.gen(function* () {
          yield* Console.error("Authorization timed out. Please try again.");
          return yield* Effect.fail(new Error("Authorization timed out"));
        }),
      ),
    );

    yield* Console.log("Authorization code received. Exchanging for tokens...");

    const tokenResponse = yield* auth.exchangeCodeForTokens(
      code,
      pkce.codeVerifier,
      redirectUri,
    );

    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    const storedTokens = yield* auth.storeTokens({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
    });

    yield* Console.log("Authentication successful! Tokens stored.");

    yield* stopCallbackServer(server);

    return storedTokens;
  }),
).pipe(
  Command.withDescription("Authenticate with YouTube via OAuth2 PKCE flow"),
);
