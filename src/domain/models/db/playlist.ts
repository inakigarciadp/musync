import type { InferSelectModel } from "drizzle-orm";
import { Schema } from "effect";
import type { playlists } from "../../../infrastructure/db/schema";
import { ensureSchema } from "./utils";

// 1. Inferred Type from Drizzle
type Playlist = InferSelectModel<typeof playlists>;

// 2. Effect Schema
const _DbPlaylistSchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.Date,
});

// 3. Enforced Binding
export const DbPlaylistSchema = ensureSchema<
  Playlist,
  typeof _DbPlaylistSchema
>(_DbPlaylistSchema);
export type DbPlaylist = Schema.Schema.Type<typeof DbPlaylistSchema>;
