import { Schema } from "effect";

export const PlaylistId = Schema.String.pipe(Schema.brand("PlaylistId"));
export type PlaylistId = typeof PlaylistId.Type;

export const VideoCount = Schema.Int.pipe(
  Schema.nonNegative(),
  Schema.brand("VideoCount"),
);
export type VideoCount = typeof VideoCount.Type;

export class Playlist extends Schema.Class<Playlist>("Playlist")({
  id: PlaylistId,
  title: Schema.String,
  publishedAt: Schema.Date,
  itemCount: VideoCount,
}) {
  get url(): string {
    return `https://www.youtube.com/playlist?list=${this.id}`;
  }
}

export class PageInfo extends Schema.Class<PageInfo>("PageInfo")({
  totalResults: VideoCount,
  resultsPerPage: VideoCount,
}) {}

export class PlaylistListResponse extends Schema.Class<PlaylistListResponse>(
  "PlaylistListResponse",
)({
  kind: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  pageInfo: Schema.optional(PageInfo),
  items: Schema.Array(Playlist),
  nextPageToken: Schema.optional(Schema.String),
}) {}
