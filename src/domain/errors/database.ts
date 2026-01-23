import { Schema } from "effect";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    reason: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class DatabaseMigrationError extends Schema.TaggedError<DatabaseMigrationError>()(
  "DatabaseMigrationError",
  {
    reason: Schema.String,
    migration: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}
