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
