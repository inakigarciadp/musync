import { Command } from "@effect/cli";
import { Console, Effect, Queue } from "effect";
import { StoredTokens } from "../../../domain/models/Auth";
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

    const pkce = yield* auth.generatePKCEPair();

    const queue = yield* Queue.unbounded<string>();

    const { server, port } = yield* startCallbackServer(queue);

    const redirectUri = `http://localhost:${port}/callback`;

    yield* Console.log(`Starting callback server on port ${port}...`);

    const authUrl = yield* auth.buildAuthorizationUrl({
      codeChallenge: pkce.codeChallenge,
      state: pkce.state,
      redirectUri,
    });

    yield* Console.log("Opening browser for authorization...");

    yield* openBrowser(authUrl).pipe(
      Effect.catchTag("BrowserOpenError", (_error) =>
        Effect.gen(function* () {
          yield* Console.warn("Could not open browser automatically.");
          yield* Console.log(`Please visit this URL: ${authUrl}`);
        }),
      ),
    );

    yield* Console.log(
      "Waiting for authorization callback (timeout: 2 minutes)...",
    );

    const code = yield* waitForAuthCode(queue, 120000);

    yield* Console.log("Authorization code received. Exchanging for tokens...");

    const tokenResponse = yield* auth.exchangeCodeForTokens(
      code,
      pkce.codeVerifier,
      redirectUri,
    );

    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    const storedTokens = yield* auth.storeTokens(
      StoredTokens.make({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt,
      }),
    );

    yield* Console.log("Authentication successful! Tokens stored.");

    yield* stopCallbackServer(server);
    return storedTokens;
  }),
).pipe(
  Command.withDescription("Authenticate with YouTube via OAuth2 PKCE flow"),
);
