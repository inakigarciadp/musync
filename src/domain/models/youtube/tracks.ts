import { Schema } from "effect";
import { PlaylistId } from "./playlist";

export const VideoId = Schema.String.pipe(Schema.brand("VideoId"));
export type VideoId = typeof VideoId.Type;

export const Position = Schema.Int.pipe(
  Schema.nonNegative(),
  Schema.brand("Position"),
);
export type Position = typeof Position.Type;

export const MaxResults = Schema.Int.pipe(
  Schema.between(1, 50),
  Schema.brand("MaxResults"),
);
export type MaxResults = typeof MaxResults.Type;

export const VideoCount = Schema.Int.pipe(
  Schema.nonNegative(),
  Schema.brand("VideoCount"),
);
export type VideoCount = typeof VideoCount.Type;

export class TrackSnippet extends Schema.Class<TrackSnippet>("TrackSnippet")({
  title: Schema.String,
  publishedAt: Schema.Date,
  channelId: Schema.optional(Schema.String),
  channelTitle: Schema.optional(Schema.String),
  videoOwnerChannelId: Schema.optional(Schema.String),
  videoOwnerChannelTitle: Schema.optional(Schema.String),
  playlistId: PlaylistId,
  position: Position,
}) {}

export class TrackContentDetails extends Schema.Class<TrackContentDetails>(
  "TrackContentDetails",
)({
  videoId: VideoId,
  videoPublishedAt: Schema.Date,
}) {}

export class Track extends Schema.Class<Track>("Track")({
  kind: Schema.optional(Schema.String),
  etag: Schema.optional(Schema.String),
  id: Schema.String,
  snippet: TrackSnippet,
  contentDetails: TrackContentDetails,
}) {}

export class PageInfo extends Schema.Class<PageInfo>("PageInfo")({
  totalResults: VideoCount,
  resultsPerPage: VideoCount,
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
