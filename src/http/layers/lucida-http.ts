import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Layer, pipe } from "effect";

const LUCIDA_BASE_URL = "https://lucida.to";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const LucidaHttpClientLive = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;

    return pipe(
      baseClient,
      HttpClient.mapRequest(HttpClientRequest.prependUrl(LUCIDA_BASE_URL)),
      HttpClient.mapRequest(
        HttpClientRequest.setHeader("User-Agent", USER_AGENT),
      ),
    );
  }),
);
