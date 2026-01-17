import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Layer, pipe } from "effect";

const GOOGLE_OAUTH_BASE_URL = "https://oauth2.googleapis.com";

export const OAuthHttpClientLive = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;

    return pipe(
      baseClient,
      HttpClient.mapRequest(
        HttpClientRequest.prependUrl(GOOGLE_OAUTH_BASE_URL),
      ),
    );
  }),
);
