import { Schema } from "effect";

export class DownloadUrlMatchingError extends Schema.TaggedError<DownloadUrlMatchingError>()(
  "DownloadUrlMatchingError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    isRateLimit: Schema.optional(Schema.Boolean),
    songName: Schema.optional(Schema.String),
    artistName: Schema.optional(Schema.String),
  },
) {}
