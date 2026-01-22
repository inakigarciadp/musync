import type { HttpClientError } from "@effect/platform";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Context, Effect, Layer, Redacted } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  type InvalidAuthorizationCodeError,
  type PKCEGenerationError,
  type TokenExchangeError,
  TokenStorageError,
} from "../domain/errors/auth-errors";
import { PKCEPair, StoredTokens, TokenResponse } from "../domain/models/Auth";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../infrastructure/oauth/pkce";
import { ConfigService } from "./config";

export class AuthService extends Context.Tag("@app/AuthService")<
  AuthService,
  {
    readonly generatePKCEPair: Effect.Effect<PKCEPair, PKCEGenerationError>;
    readonly buildAuthorizationUrl: (params: {
      codeChallenge: string;
      state: string;
      redirectUri: string;
    }) => Effect.Effect<string>;
    readonly exchangeCodeForTokens: (
      code: string,
      codeVerifier: string,
      redirectUri: string,
    ) => Effect.Effect<
      TokenResponse,
      | TokenExchangeError
      | InvalidAuthorizationCodeError
      | HttpClientError.HttpClientError
      | ParseError
    >;
    readonly storeTokens: (
      tokens: StoredTokens,
    ) => Effect.Effect<void, TokenStorageError>;
    readonly loadTokens: Effect.Effect<StoredTokens | null, TokenStorageError>;
  }
>() {
  static readonly layer = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const config = yield* ConfigService;
      const http = yield* HttpClient.HttpClient;
      const tokenStoragePath = yield* config.getTokenStoragePath;

      const generatePKCEPair = Effect.gen(function* () {
        const codeVerifier = yield* generateCodeVerifier;
        const codeChallenge = yield* generateCodeChallenge(codeVerifier);
        const state = yield* generateState;
        return PKCEPair.make({ codeVerifier, codeChallenge, state });
      });

      const buildAuthorizationUrl = (params: {
        codeChallenge: string;
        state: string;
        redirectUri: string;
      }) =>
        Effect.gen(function* () {
          const clientId = yield* config.getClientId;
          const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          url.searchParams.set("client_id", clientId);
          url.searchParams.set("redirect_uri", params.redirectUri);
          url.searchParams.set(
            "scope",
            "https://www.googleapis.com/auth/youtube.readonly",
          );
          url.searchParams.set("response_type", "code");
          url.searchParams.set("access_type", "offline");
          url.searchParams.set("code_challenge", params.codeChallenge);
          url.searchParams.set("code_challenge_method", "S256");
          url.searchParams.set("state", params.state);
          return url.toString();
        });

      const exchangeCodeForTokens = (
        code: string,
        codeVerifier: string,
        redirectUri: string,
      ) =>
        Effect.gen(function* () {
          const clientId = yield* config.getClientId;
          const clientSecret = yield* config.getClientSecret;

          const response = yield* http.pipe(HttpClient.filterStatusOk).execute(
            HttpClientRequest.post("https://oauth2.googleapis.com/token").pipe(
              HttpClientRequest.bodyUrlParams({
                client_id: clientId,
                client_secret: Redacted.value(clientSecret),
                code,
                code_verifier: codeVerifier,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
              }),
            ),
          );

          return yield* HttpClientResponse.schemaBodyJson(TokenResponse)(
            response,
          );
        });

      const storeTokens = (tokens: StoredTokens) =>
        Effect.gen(function* () {
          const fs = (yield* Effect.tryPromise({
            try: () => import("node:fs/promises"),
            catch: (error) =>
              TokenStorageError.make({
                reason: `Failed to import fs/promises: ${error}`,
              }),
          })) as typeof import("node:fs/promises");

          yield* Effect.tryPromise({
            try: () =>
              fs.writeFile(tokenStoragePath, JSON.stringify(tokens), {
                mode: 0o600,
              }),
            catch: (error) =>
              TokenStorageError.make({
                reason: `Failed to store tokens: ${error}`,
              }),
          });
        });

      const loadTokens = Effect.gen(function* () {
        const fs = (yield* Effect.tryPromise({
          try: () => import("node:fs/promises"),
          catch: (error) =>
            TokenStorageError.make({
              reason: `Failed to import fs/promises: ${error}`,
            }),
        })) as typeof import("node:fs/promises");

        const content = yield* Effect.tryPromise({
          try: () => fs.readFile(tokenStoragePath, "utf-8"),
          catch: (error) =>
            TokenStorageError.make({
              reason: `Failed to read tokens: ${error}`,
            }),
        });

        const data = JSON.parse(content);
        return StoredTokens.make({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: new Date(data.expiresAt),
        });
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

      return AuthService.of({
        generatePKCEPair,
        buildAuthorizationUrl,
        exchangeCodeForTokens,
        storeTokens,
        loadTokens,
      });
    }),
  );
}
