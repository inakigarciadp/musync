import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Layer, pipe } from "effect";
import { AuthService } from "../../services/auth";

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

export const YouTubeApiHttpClientLive = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const baseClient = yield* HttpClient.HttpClient;

    return pipe(
      baseClient,
      HttpClient.mapRequest(HttpClientRequest.prependUrl(YOUTUBE_API_BASE_URL)),
      // Convert non-2xx responses to ResponseError so they're caught by handleHttpError
      HttpClient.filterStatusOk,
      HttpClient.mapRequestEffect((request) =>
        Effect.gen(function* () {
          const tokens = yield* auth.loadTokens().pipe(
            Effect.catchTags({
              TokenStorageError: () => Effect.succeed(null),
              ParseError: () => Effect.succeed(null),
            }),
          );
          if (!tokens) {
            return request;
          }
          return pipe(
            request,
            HttpClientRequest.bearerToken(tokens.accessToken),
          );
        }),
      ),
    );
  }),
);
