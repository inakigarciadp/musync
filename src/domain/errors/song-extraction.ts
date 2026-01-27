import { Schema } from "effect";

export class SongExtractionError extends Schema.TaggedError<SongExtractionError>()(
  "SongExtractionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    isRateLimit: Schema.optional(Schema.Boolean),
  },
) {}
