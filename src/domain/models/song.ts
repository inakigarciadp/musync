import { Schema } from "effect";

// Schema for LLM structured output
export const SongExtraction = Schema.Struct({
  songName: Schema.NullOr(Schema.String),
  artistName: Schema.NullOr(Schema.String),
});
