import { Schema } from "effect";

/**
 * Error thrown when a service rate limits us too many times.
 * This error is not retryable - it should fail the sync command.
 */
export class RateLimitExceededError extends Schema.TaggedError<RateLimitExceededError>()(
  "RateLimitExceededError",
  {
    message: Schema.String,
    service: Schema.String, // "lucida" | "cerebras"
    retryCount: Schema.Number,
  },
) {}

/**
 * Error thrown when a URL cannot be parsed or decoded.
 */
export class UrlParseError extends Schema.TaggedError<UrlParseError>()(
  "UrlParseError",
  {
    message: Schema.String,
    url: Schema.String,
  },
) {}

/**
 * Error thrown when two or more playlists would produce the same
 * sanitized filename for M3U8 generation.
 */
export class DuplicatePlaylistNameError extends Schema.TaggedError<DuplicatePlaylistNameError>()(
  "DuplicatePlaylistNameError",
  {
    message: Schema.String,
    duplicateName: Schema.String,
    playlistIds: Schema.Array(Schema.String),
  },
) {}
