import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(), // YouTube Playlist ID
  createdAt: timestamp("created_at")
    .$default(() => new Date())
    .notNull(),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(), // YouTube Video ID
  title: text("title").notNull(),
  channelTitle: text("channel_title"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at")
    .$default(() => new Date())
    .notNull(),
});

export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at"), // When was added to the playlist
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.trackId] })],
);
