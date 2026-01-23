import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(), // YouTube Playlist ID
  createdAt: timestamp("created_at")
    .$default(() => new Date())
    .notNull(),
});
