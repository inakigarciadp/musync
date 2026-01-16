import { Schema } from "effect";

export const PlaylistId = Schema.String.pipe(
  Schema.minLength(11),
  Schema.maxLength(34),
  Schema.brand("PlaylistId"),
);
export type PlaylistId = typeof PlaylistId.Type;
