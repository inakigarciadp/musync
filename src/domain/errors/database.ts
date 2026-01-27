import { Schema } from "effect";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class DatabaseMigrationError extends Schema.TaggedError<DatabaseMigrationError>()(
  "DatabaseMigrationError",
  {
    message: Schema.String,
    migration: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}
