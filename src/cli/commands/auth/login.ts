import { Command } from "@effect/cli";
import { Console, Effect, Queue } from "effect";
import { AuthTimeoutError } from "../../../domain/errors/auth";
import { StoredTokens } from "../../../domain/models/auth";
import { openBrowser } from "../../../infrastructure/oauth/browser";
import { acquireCallbackServer } from "../../../infrastructure/oauth/callback-server";
import { AuthService } from "../../../services/auth";

const loginHandler = Effect.fnUntraced(function* () {
  yield* Console.log("Starting OAuth2 authentication flow...");

  const auth = yield* AuthService;

  const pkce = yield* auth.generatePKCEPair();

  const { port, queue } = yield* acquireCallbackServer;

  const redirectUri = `http://localhost:${port}/callback`;

  yield* Console.log(`Starting callback server on port ${port}...`);

  const authUrl = yield* auth.buildAuthorizationUrl({
    codeChallenge: pkce.codeChallenge,
    state: pkce.state,
    redirectUri,
  });

  yield* Console.log("Opening browser for authorization...");

  yield* openBrowser(authUrl).pipe(
    Effect.catchTag(
      "BrowserOpenError",
      Effect.fnUntraced(function* (_error) {
        yield* Console.warn("Could not open browser automatically.");
        yield* Console.log(`Please visit this URL: ${authUrl}`);
      }),
    ),
  );

  yield* Console.log(
    "Waiting for authorization callback (timeout: 2 minutes)...",
  );

  const code = yield* Queue.take(queue).pipe(
    Effect.timeoutFail({
      duration: 120000,
      onTimeout: () => AuthTimeoutError.make({ timeoutMs: 120000 }),
    }),
  );

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

  return storedTokens;
});

export const loginCommand = Command.make("login", {}, () =>
  Effect.scoped(loginHandler()),
).pipe(
  Command.withDescription("Authenticate with YouTube via OAuth2 PKCE flow"),
);
