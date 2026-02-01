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
