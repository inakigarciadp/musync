import { Schema } from "effect";

export class LucidaSearchError extends Schema.TaggedError<LucidaSearchError>()(
  "LucidaSearchError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    isRateLimit: Schema.optional(Schema.Boolean),
    query: Schema.optional(Schema.String),
  },
) {}

export class LucidaParseError extends Schema.TaggedError<LucidaParseError>()(
  "LucidaParseError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    query: Schema.String,
    parseMethod: Schema.String, // "json" | "html" | "both"
  },
) {}

export class CloudflareChallengeError extends Schema.TaggedError<CloudflareChallengeError>()(
  "CloudflareChallengeError",
  {
    message: Schema.String,
    url: Schema.String, // The URL the user needs to visit to solve the challenge
  },
) {}

export class LucidaDownloadError extends Schema.TaggedError<LucidaDownloadError>()(
  "LucidaDownloadError",
  {
    message: Schema.String,
    trackUrl: Schema.String,
    phase: Schema.String, // "init" | "poll" | "stream" | "save"
    cause: Schema.optional(Schema.Unknown),
    isRetryable: Schema.optional(Schema.Boolean),
    isRateLimit: Schema.optional(Schema.Boolean),
  },
) {}

export class LucidaDownloadTimeoutError extends Schema.TaggedError<LucidaDownloadTimeoutError>()(
  "LucidaDownloadTimeoutError",
  {
    message: Schema.String,
    trackUrl: Schema.String,
    timeoutMs: Schema.Number,
  },
) {}
