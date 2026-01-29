import {
  FileSystem,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Option, Redacted, Ref, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  type InvalidAuthorizationCodeError,
  type PKCEGenerationError,
  type TokenExchangeError,
  TokenRefreshError,
  TokenStorageError,
} from "../domain/errors/auth";
import {
  PKCEPair,
  StoredTokens,
  StoredTokensFromJson,
  TokenRefreshResponse,
  TokenResponse,
} from "../domain/models/auth";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../infrastructure/oauth/pkce";
import { ConfigService } from "./config";

export class AuthService extends Effect.Service<AuthService>()("AuthService", {
  accessors: true,
  dependencies: [ConfigService.Default],
  effect: Effect.gen(function* () {
    const config = yield* ConfigService;
    const http = yield* HttpClient.HttpClient; // Infrastructure - leaked OK
    const fs = yield* FileSystem.FileSystem; // Infrastructure - leaked OK
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

      return yield* HttpClientResponse.schemaBodyJson(TokenResponse)(response);
    });

    const storeTokens = Effect.fn("AuthService.storeTokens")(function* (
      tokens: StoredTokens,
    ) {
      const json = yield* Schema.encode(StoredTokensFromJson)(tokens);

      yield* fs
        .writeFileString(tokenStoragePath, json, {
          mode: 0o600,
        })
        .pipe(
          Effect.mapError((error: PlatformError) =>
            TokenStorageError.make({
              message: `Failed to store tokens: ${error.message}`,
            }),
          ),
        );
    });

    const loadTokens = fs.readFileString(tokenStoragePath).pipe(
      Effect.mapError((error) =>
        TokenStorageError.make({
          message: `Failed to read tokens: ${error.message}`,
        }),
      ),
      Effect.flatMap((content) =>
        Schema.decodeUnknown(StoredTokensFromJson)(content),
      ),
      Effect.catchTag("TokenStorageError", (error) => {
        if (
          error.message.includes("NotFound") ||
          error.message.includes("ENOENT")
        ) {
          return Effect.succeed(null);
        }
        return Effect.fail(error);
      }),
    );

    const clearTokens = fs.remove(tokenStoragePath).pipe(
      Effect.mapError((error) =>
        TokenStorageError.make({
          message: `Failed to delete tokens: ${error.message}`,
        }),
      ),
      Effect.catchTag("TokenStorageError", (error) => {
        if (
          error.message.includes("NotFound") ||
          error.message.includes("ENOENT")
        ) {
          return Effect.void;
        }
        return Effect.fail(error);
      }),
    );

    const refreshSemaphore = yield* Effect.makeSemaphore(1);
    const tokensRef = yield* Ref.make<Option.Option<StoredTokens>>(
      Option.none(),
    );

    const refreshTokensInternal = Effect.fn(
      "AuthService.refreshTokensInternal",
    )(function* () {
      const tokensOpt = yield* Effect.map(loadTokens, Option.fromNullable);
      const currentTokens = Option.getOrThrowWith(tokensOpt, () =>
        TokenRefreshError.make({
          message: "No stored tokens found - please login first",
        }),
      );

      const clientSecret = config.clientSecret;

      const response = yield* http.pipe(HttpClient.filterStatusOk).execute(
        HttpClientRequest.post("/token").pipe(
          HttpClientRequest.bodyUrlParams({
            client_id: config.clientId,
            client_secret: Redacted.value(clientSecret),
            refresh_token: currentTokens.refreshToken,
            grant_type: "refresh_token",
          }),
        ),
      );

      const tokenResponse =
        yield* HttpClientResponse.schemaBodyJson(TokenRefreshResponse)(
          response,
        );

      const newTokens = StoredTokens.make({
        accessToken: tokenResponse.access_token,
        refreshToken: currentTokens.refreshToken,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      });

      return newTokens;
    });

    const getAccessToken = Effect.fn("AuthService.getAccessToken")(
      function* () {
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;

        let tokensOpt = yield* Ref.get(tokensRef);
        if (Option.isNone(tokensOpt)) {
          const rawTokens = yield* loadTokens;
          tokensOpt = Option.fromNullable(rawTokens);
          if (Option.isSome(tokensOpt)) {
            yield* Ref.set(tokensRef, tokensOpt);
          }
        }

        const tokens = Option.getOrThrowWith(tokensOpt, () =>
          TokenRefreshError.make({
            message: "Not authenticated - please run musync auth login",
          }),
        );

        if (tokens.expiresAt.getTime() - now < FIVE_MINUTES) {
          return yield* refreshSemaphore.withPermits(1)(
            Effect.gen(function* () {
              const freshOpt = yield* Ref.get(tokensRef);
              if (Option.isSome(freshOpt)) {
                const t = freshOpt.value;
                if (t.expiresAt.getTime() - Date.now() >= FIVE_MINUTES) {
                  return t.accessToken;
                }
              }

              const newTokens = yield* refreshTokensInternal();
              yield* storeTokens(newTokens);
              yield* Ref.set(tokensRef, Option.some(newTokens));
              return newTokens.accessToken;
            }),
          );
        }

        return tokens.accessToken;
      },
    );

    const refreshTokens = Effect.fn("AuthService.refreshTokens")(function* () {
      return yield* refreshSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const newTokens = yield* refreshTokensInternal();
          yield* storeTokens(newTokens);
          yield* Ref.set(tokensRef, Option.some(newTokens));
          return newTokens;
        }),
      );
    });

    return {
      generatePKCEPair,
      buildAuthorizationUrl,
      exchangeCodeForTokens,
      storeTokens,
      loadTokens: () => loadTokens,
      clearTokens: () => clearTokens,
      refreshTokens,
      getAccessToken,
    } satisfies {
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
      readonly refreshTokens: () => Effect.Effect<
        StoredTokens,
        | TokenRefreshError
        | TokenStorageError
        | HttpClientError.HttpClientError
        | ParseError
      >;
      readonly getAccessToken: () => Effect.Effect<
        string,
        | TokenRefreshError
        | TokenStorageError
        | HttpClientError.HttpClientError
        | ParseError
      >;
    };
  }),
}) {}
