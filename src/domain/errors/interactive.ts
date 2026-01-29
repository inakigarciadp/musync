import { Schema } from "effect";

/**
 * Error for when the user interrupts an interactive prompt (e.g., pressing Ctrl+C).
 * This wraps the low-level QuitException from @effect/platform/Terminal into a
domain-specific error for centralized error handling.
 */
export class UserInterruptError extends Schema.TaggedError<UserInterruptError>()(
  "UserInterruptError",
  {
    context: Schema.optional(Schema.String),
  },
) {}
