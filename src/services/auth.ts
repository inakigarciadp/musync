import fs from "node:fs/promises";
import type { HttpClientError } from "@effect/platform";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  type InvalidAuthorizationCodeError,
  type PKCEGenerationError,
  type TokenExchangeError,
  TokenStorageError,
} from "../domain/errors/auth";
import {
  PKCEPair,
  type StoredTokens,
  StoredTokensFromJson,
  TokenResponse,
} from "../domain/models/auth";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../infrastructure/oauth/pkce";
import { ConfigService } from "./config";

export class AuthService extends Context.Tag("@app/AuthService")<
  AuthService,
  {
    readonly generatePKCEPair: () => Effect.Effect<
      PKCEPair,
      PKCEGenerationError | ParseError
    >;
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
    ) => Effect.Effect<void, TokenStorageError | ParseError>;
    readonly loadTokens: () => Effect.Effect<
      StoredTokens | null,
      TokenStorageError | ParseError
    >;
    readonly clearTokens: () => Effect.Effect<void, TokenStorageError>;
  }
>() {
  static readonly layer = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const config = yield* ConfigService;
      const http = yield* HttpClient.HttpClient;
      const tokenStoragePath = config.tokenStoragePath;

      const generatePKCEPair = Effect.fn("AuthService.generatePKCEPair")(
        function* () {
          const codeVerifier = yield* generateCodeVerifier();
          const codeChallenge = yield* generateCodeChallenge(codeVerifier);
          const state = yield* generateState();
          return PKCEPair.make({
            codeVerifier,
            codeChallenge,
            state,
          });
        },
      );

      const buildAuthorizationUrl = Effect.fn(
        "AuthService.buildAuthorizationUrl",
      )(
        (params: {
          codeChallenge: string;
          state: string;
          redirectUri: string;
        }) => {
          const clientId = config.clientId;
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
          return Effect.succeed(url.toString());
        },
      );

      const exchangeCodeForTokens = Effect.fn(
        "AuthService.exchangeCodeForTokens",
      )(function* (code: string, codeVerifier: string, redirectUri: string) {
        const clientId = config.clientId;
        const clientSecret = config.clientSecret;

        const response = yield* http.pipe(HttpClient.filterStatusOk).execute(
          HttpClientRequest.post("/token").pipe(
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

      const storeTokens = Effect.fn("AuthService.storeTokens")(function* (
        tokens: StoredTokens,
      ) {
        const json = yield* Schema.encode(StoredTokensFromJson)(tokens);

        yield* Effect.tryPromise({
          try: () =>
            fs.writeFile(tokenStoragePath, json, {
              mode: 0o600,
            }),
          catch: (error) =>
            TokenStorageError.make({
              reason: `Failed to store tokens: ${error}`,
            }),
        });
      });

      const loadTokens = Effect.tryPromise({
        try: () => fs.readFile(tokenStoragePath, "utf-8"),
        catch: (error) =>
          TokenStorageError.make({
            reason: `Failed to read tokens: ${error}`,
          }),
      }).pipe(
        Effect.flatMap((content) =>
          Schema.decodeUnknown(StoredTokensFromJson)(content),
        ),
        Effect.catchTag("TokenStorageError", (error) => {
          if (error.reason.includes("ENOENT")) {
            return Effect.succeed(null);
          }
          return Effect.fail(error);
        }),
      );

      const clearTokens = Effect.tryPromise({
        try: () => fs.unlink(tokenStoragePath),
        catch: (error) =>
          TokenStorageError.make({
            reason: `Failed to delete tokens: ${error}`,
          }),
      }).pipe(
        Effect.catchTag("TokenStorageError", (error) => {
          if (error.reason.includes("ENOENT")) {
            return Effect.void;
          }
          return Effect.fail(error);
        }),
      );

      return AuthService.of({
        generatePKCEPair,
        buildAuthorizationUrl,
        exchangeCodeForTokens,
        storeTokens,
        loadTokens: () => loadTokens,
        clearTokens: () => clearTokens,
      });
    }),
  );
}
