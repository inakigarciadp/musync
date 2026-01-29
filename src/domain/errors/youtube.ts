import { Schema } from "effect";

export class AuthenticationRequiredError extends Schema.TaggedError<AuthenticationRequiredError>()(
  "AuthenticationRequiredError",
  {
    message: Schema.String,
  },
) {}

export class PermissionDeniedError extends Schema.TaggedError<PermissionDeniedError>()(
  "PermissionDeniedError",
  {
    message: Schema.String,
  },
) {}

export class ResourceNotFoundError extends Schema.TaggedError<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  {
    resource: Schema.String,
    message: Schema.String,
  },
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.String,
    retryAfter: Schema.optional(Schema.Number),
    retryable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  },
) {}

export class YouTubeServiceUnavailableError extends Schema.TaggedError<YouTubeServiceUnavailableError>()(
  "YouTubeServiceUnavailableError",
  {
    message: Schema.String,
  },
) {}

export class YouTubeNetworkError extends Schema.TaggedError<YouTubeNetworkError>()(
  "YouTubeNetworkError",
  {
    message: Schema.String,
    error: Schema.Defect,
  },
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
  },
) {}

export class PlaylistOperationUnsupportedError extends Schema.TaggedError<PlaylistOperationUnsupportedError>()(
  "PlaylistOperationUnsupportedError",
  {
    message: Schema.String,
  },
) {}

export class YouTubeApiError extends Schema.TaggedError<YouTubeApiError>()(
  "YouTubeApiError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
  },
) {}
