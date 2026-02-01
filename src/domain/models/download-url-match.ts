import { Schema } from "effect";

// Schema for LLM structured output
export const DownloadUrlMatch = Schema.Struct({
  selectedIndex: Schema.NullOr(Schema.Int.pipe(Schema.nonNegative())), // null if no good match found, must be non-negative integer
});

export type DownloadUrlMatch = typeof DownloadUrlMatch.Type;
