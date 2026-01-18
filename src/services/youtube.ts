import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Context, Effect, Layer, Match } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  AuthenticationRequiredError,
  RateLimitError,
  ResourceNotFoundError,
  YouTubeApiError,
  YouTubeNetworkError,
  YouTubeServiceUnavailableError,
} from "../domain/errors/youtube-errors";
import {
  type MaxResults,
  PlaylistListResponse,
} from "../domain/models/youtube";

const handleHttpError = (
  error: HttpClientError,
): Effect.Effect<
  never,
  | YouTubeApiError
  | YouTubeNetworkError
  | AuthenticationRequiredError
  | RateLimitError
  | ResourceNotFoundError
  | YouTubeServiceUnavailableError,
  never
> => {
  if (error._tag === "ResponseError") {
    return Match.value(error.response.status).pipe(
      Match.when(401, () =>
        Effect.fail(
          AuthenticationRequiredError.make({
            message: "Not authenticated. Run 'musync auth login' first.",
          }),
        ),
      ),
      Match.when(403, () =>
        Effect.fail(
          AuthenticationRequiredError.make({
            message: "Not authenticated. Run 'musync auth login' first.",
          }),
        ),
      ),
      Match.when(404, () =>
        Effect.fail(
          ResourceNotFoundError.make({
            resource: "Playlist",
            message: "Resource not found",
          }),
        ),
      ),
      Match.when(429, () =>
        Effect.fail(
          RateLimitError.make({
            message: "YouTube API quota exceeded",
          }),
        ),
      ),
      Match.when(
        (s) => [500, 502, 503, 504].includes(s),
        () =>
          Effect.fail(
            YouTubeServiceUnavailableError.make({
              message: `YouTube API unavailable: ${error.response.status}`,
            }),
          ),
      ),
      Match.orElse(() =>
        Effect.fail(
          YouTubeApiError.make({
            statusCode: error.response.status,
            message: error.message,
          }),
        ),
      ),
    );
  }
  return Effect.fail(
    YouTubeNetworkError.make({
      message: "Network error occurred",
      error: error as unknown,
    }),
  );
};

export class YouTubeService extends Context.Tag("@app/YouTubeService")<
  YouTubeService,
  {
    readonly listPlaylists: (
      pageToken?: string,
      maxResults?: MaxResults,
    ) => Effect.Effect<
      PlaylistListResponse,
      | YouTubeApiError
      | YouTubeNetworkError
      | AuthenticationRequiredError
      | RateLimitError
      | ResourceNotFoundError
      | YouTubeServiceUnavailableError
      | ParseError
    >;
  }
>() {
  static readonly layer = Layer.effect(
    YouTubeService,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      const listPlaylists = Effect.fnUntraced(
        function* (pageToken?: string, maxResults?: MaxResults) {
          const request = HttpClientRequest.get("/playlists").pipe(
            HttpClientRequest.setUrlParams({
              part: "snippet,contentDetails,id",
              mine: "true",
              maxResults: maxResults ?? 20,
              ...(pageToken && { pageToken }),
            }),
          );
          const response = yield* http.execute(request);

          return yield* HttpClientResponse.schemaBodyJson(PlaylistListResponse)(
            response,
          );
        },
        (effect) =>
          effect.pipe(
            Effect.catchTags({
              ResponseError: handleHttpError,
              RequestError: handleHttpError,
            }),
          ),
      );

      return YouTubeService.of({ listPlaylists });
    }),
  );
}
