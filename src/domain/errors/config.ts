import { Schema } from "effect";

export class ConfigNotFoundError extends Schema.TaggedError<ConfigNotFoundError>()(
  "ConfigNotFoundError",
  {
    message: Schema.String,
    path: Schema.String,
  },
) {}

export class ConfigReadError extends Schema.TaggedError<ConfigReadError>()(
  "ConfigReadError",
  {
    message: Schema.String,
    path: Schema.String,
  },
) {}

export class ConfigWriteError extends Schema.TaggedError<ConfigWriteError>()(
  "ConfigWriteError",
  {
    message: Schema.String,
    path: Schema.String,
  },
) {}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  {
    message: Schema.String,
    key: Schema.optional(Schema.String),
  },
) {}
