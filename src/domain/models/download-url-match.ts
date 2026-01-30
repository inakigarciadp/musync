import { Schema } from "effect";

// Schema for LLM structured output
export const DownloadUrlMatch = Schema.Struct({
  selectedIndex: Schema.NullOr(Schema.Number), // null if no good match found
});

export type DownloadUrlMatch = typeof DownloadUrlMatch.Type;
