import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Layer, Option, pipe } from "effect";
import { CloudflareCredentialsService } from "../../services/cloudflare-credentials";

const LUCIDA_BASE_URL = "https://lucida.to";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const LucidaHttpClientLive = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;
    const cfCredentials = yield* CloudflareCredentialsService;

    // Try to load stored Cloudflare credentials
    const credentials = yield* cfCredentials.loadCredentials().pipe(
      Effect.map(Option.fromNullable),
      // If loading fails, continue without credentials
      Effect.catchAll(() => Effect.succeed(Option.none())),
    );

    const userAgent = Option.match(credentials, {
      onNone: () => DEFAULT_USER_AGENT,
      onSome: (creds) => creds.userAgent,
    });

    let client = pipe(
      baseClient,
      HttpClient.mapRequest(HttpClientRequest.prependUrl(LUCIDA_BASE_URL)),
      HttpClient.mapRequest(
        HttpClientRequest.setHeader("User-Agent", userAgent),
      ),
    );

    // Only add cookie header if we have credentials
    if (Option.isSome(credentials)) {
      client = pipe(
        client,
        HttpClient.mapRequest(
          HttpClientRequest.setHeader(
            "Cookie",
            `cf_clearance=${credentials.value.cfClearance}`,
          ),
        ),
      );
    }

    return client;
  }),
);
