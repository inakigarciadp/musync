import { Schema } from "effect";

export const LucidaTrack = Schema.Struct({
  name: Schema.String,
  artist: Schema.String,
  album: Schema.NullOr(Schema.String),
  url: Schema.String, // Tidal track URL
});

export type LucidaTrack = typeof LucidaTrack.Type;
