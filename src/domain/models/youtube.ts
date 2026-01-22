import { Schema } from "effect";

// Playlist-related types

export const PlaylistId = Schema.String.pipe(Schema.brand("PlaylistId"));
export type PlaylistId = typeof PlaylistId.Type;

export const VideoCount = Schema.Int.pipe(
  Schema.nonNegative(),
  Schema.brand("VideoCount"),
);
export type VideoCount = typeof VideoCount.Type;

export const MaxResults = Schema.Int.pipe(
  Schema.between(1, 50),
  Schema.brand("MaxResults"),
);
export type MaxResults = typeof MaxResults.Type;

export class PlaylistSnippet extends Schema.Class<PlaylistSnippet>(
  "PlaylistSnippet",
)({
  title: Schema.String,
  publishedAt: Schema.Date,
  description: Schema.optional(Schema.String),
}) {}

export class PlaylistContentDetails extends Schema.Class<PlaylistContentDetails>(
  "PlaylistContentDetails",
)({
  itemCount: VideoCount,
}) {}

export class Playlist extends Schema.Class<Playlist>("Playlist")({
  kind: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  id: PlaylistId,
  snippet: PlaylistSnippet,
  contentDetails: PlaylistContentDetails,
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

// Track-related types

export const VideoId = Schema.String.pipe(Schema.brand("VideoId"));
export type VideoId = typeof VideoId.Type;

export const Position = Schema.Int.pipe(
  Schema.nonNegative(),
  Schema.brand("Position"),
);
export type Position = typeof Position.Type;

export class TrackSnippet extends Schema.Class<TrackSnippet>("TrackSnippet")({
  title: Schema.String,
  publishedAt: Schema.Date, // When added to playlist
  channelId: Schema.optional(Schema.String), // Playlist owner channel ID
  channelTitle: Schema.optional(Schema.String), // Playlist owner channel title
  videoOwnerChannelId: Schema.optional(Schema.String), // Video uploader channel ID
  videoOwnerChannelTitle: Schema.optional(Schema.String), // Video uploader channel title
  playlistId: PlaylistId,
  position: Position,
}) {}

export class TrackContentDetails extends Schema.Class<TrackContentDetails>(
  "TrackContentDetails",
)({
  videoId: VideoId,
  videoPublishedAt: Schema.Date, // When video was published to YouTube
}) {}

export class Track extends Schema.Class<Track>("Track")({
  kind: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  id: Schema.String, // PlaylistItem ID (not video ID)
  snippet: TrackSnippet,
  contentDetails: TrackContentDetails,
}) {}

export class TrackListResponse extends Schema.Class<TrackListResponse>(
  "TrackListResponse",
)({
  kind: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  pageInfo: Schema.optional(PageInfo),
  items: Schema.Array(Track),
  nextPageToken: Schema.optional(Schema.String),
}) {}
