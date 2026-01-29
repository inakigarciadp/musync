import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Effect, Match } from "effect";
import type { ParseError } from "effect/ParseResult";
import {
  AuthenticationRequiredError,
  RateLimitError,
  ResourceNotFoundError,
  YouTubeApiError,
  YouTubeNetworkError,
  YouTubeServiceUnavailableError,
} from "../domain/errors/youtube";
import {
  type MaxResults,
  type PageInfo,
  type PlaylistId,
  PlaylistListResponse,
} from "../domain/models/youtube/playlist";
import { TrackListResponse } from "../domain/models/youtube/tracks";

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

export class YouTubeService extends Effect.Service<YouTubeService>()(
  "YouTubeService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient; // Infrastructure - leaked OK

      const listPlaylists = Effect.fn("YouTubeService.listPlaylists")(
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

      const listAllPlaylists = Effect.fn("YouTubeService.listAllPlaylists")(
        function* () {
          const allItems = [];
          let pageToken: string | undefined;
          let lastPageInfo: PageInfo | undefined;

          while (true) {
            const response = yield* listPlaylists(pageToken, 50 as MaxResults);
            allItems.push(...response.items);
            lastPageInfo = response.pageInfo;

            pageToken = response.nextPageToken;
            if (!pageToken) {
              break;
            }
          }

          return new PlaylistListResponse({
            kind: "youtube#playlistListResponse",
            etag: undefined,
            pageInfo: lastPageInfo,
            items: allItems,
            nextPageToken: undefined,
          });
        },
      );

      const listAllPlaylistItems = Effect.fn(
        "YouTubeService.listAllPlaylistItems",
      )(function* (playlistId: PlaylistId) {
        const allItems = [];
        let pageToken: string | undefined;
        let lastPageInfo: PageInfo | undefined;

        while (true) {
          const response = yield* listPlaylistItems(
            playlistId,
            pageToken,
            50 as MaxResults,
          );
          allItems.push(...response.items);
          lastPageInfo = response.pageInfo;

          pageToken = response.nextPageToken;
          if (!pageToken) {
            break;
          }
        }

        return new TrackListResponse({
          kind: "youtube#playlistItemListResponse",
          etag: undefined,
          pageInfo: lastPageInfo,
          items: allItems,
          nextPageToken: undefined,
        });
      });

      const listPlaylistItems = Effect.fn("YouTubeService.listPlaylistItems")(
        function* (
          playlistId: PlaylistId,
          pageToken?: string,
          maxResults?: MaxResults,
        ) {
          const request = HttpClientRequest.get("/playlistItems").pipe(
            HttpClientRequest.setUrlParams({
              part: "snippet,contentDetails",
              playlistId,
              maxResults: maxResults ?? 20,
              ...(pageToken && { pageToken }),
            }),
          );
          const response = yield* http.execute(request);

          return yield* HttpClientResponse.schemaBodyJson(TrackListResponse)(
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

      return {
        listPlaylists,
        listAllPlaylists,
        listAllPlaylistItems,
        listPlaylistItems,
      }
    }),
  },
) {}
