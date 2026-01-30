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

export const songs = sqliteTable("songs", {
  trackId: text("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  songName: text("song_name"), // nullable if extraction failed
  artistName: text("artist_name"), // nullable if extraction failed
  extractionState: text("extraction_state", {
    enum: ["finalized", "manual_review"],
  }).notNull(),
  downloadUrl: text("download_url"), // Tidal track URL (e.g., https://tidal.com/browse/track/12345)
  createdAt: timestamp("created_at")
    .$default(() => new Date())
    .notNull(),
});
