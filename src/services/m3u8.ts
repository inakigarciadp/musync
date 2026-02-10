import { FileSystem } from "@effect/platform";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Effect } from "effect";
import { FileSystemError } from "../domain/errors/auth";
import { DatabaseService } from "./database";
import { getFlacDuration } from "./flac-duration";
import { UserConfigService } from "./user-config";

export class M3UService extends Effect.Service<M3UService>()("M3UService", {
  accessors: true,
  dependencies: [DatabaseService.Default, UserConfigService.Default],
  effect: Effect.gen(function* () {
    const dbService = yield* DatabaseService;
    const userConfig = yield* UserConfigService;
    const fs = yield* FileSystem.FileSystem;

    /**
     * Generate M3U8 playlist files for all tracked playlists.
     *
     * For each tracked playlist:
     * 1. Query downloaded tracks ordered by YouTube position
     * 2. Probe each FLAC file for duration
     * 3. Write the .m3u8 file to <musicDir>/playlists/<playlistId>.m3u8
     *
     * Also cleans up orphaned .m3u8 files for playlists no longer tracked.
     */
    const generatePlaylists = Effect.fn("M3UService.generatePlaylists")(
      function* () {
        const { schema, runQuery } = dbService;

        const musicDir = yield* userConfig.getEffectiveMusicDir();
        const playlistsDir = `${musicDir}/playlists`;

        // Ensure playlists directory exists
        yield* fs.makeDirectory(playlistsDir, { recursive: true }).pipe(
          Effect.mapError((e) =>
            FileSystemError.make({
              message: `Failed to create playlists directory: ${e.message}`,
              path: playlistsDir,
            }),
          ),
        );

        // Get all tracked playlist IDs
        const trackedPlaylists = yield* runQuery(async (db) => {
          return await db
            .select({ id: schema.playlists.id })
            .from(schema.playlists)
            .all();
        });

        yield* Effect.logInfo(
          `Generating M3U8 playlists for ${trackedPlaylists.length} tracked playlists`,
        );

        const trackedIds = trackedPlaylists.map((p) => p.id);

        // Generate each playlist file
        for (const playlist of trackedPlaylists) {
          yield* generatePlaylistFile(
            playlist.id,
            musicDir,
            playlistsDir,
            schema,
            runQuery,
          );
        }

        // Clean up orphaned .m3u8 files
        yield* cleanupOrphanedFiles(playlistsDir, trackedIds);

        yield* Effect.logInfo("M3U8 playlist generation completed");
      },
    );

    /**
     * Generate a single M3U8 playlist file.
     */
    const generatePlaylistFile = Effect.fn("M3UService.generatePlaylistFile")(
      function* (
        playlistId: string,
        musicDir: string,
        playlistsDir: string,
        schema: typeof dbService.schema,
        runQuery: typeof dbService.runQuery,
      ) {
        // Query tracks for this playlist that have been downloaded,
        // ordered by their YouTube playlist position
        const tracks = yield* runQuery(async (db) => {
          return await db
            .select({
              songName: schema.songs.songName,
              artistName: schema.songs.artistName,
              filename: schema.songs.filename,
              position: schema.playlistTracks.position,
            })
            .from(schema.playlistTracks)
            .innerJoin(
              schema.songs,
              eq(schema.playlistTracks.trackId, schema.songs.trackId),
            )
            .where(
              and(
                eq(schema.playlistTracks.playlistId, playlistId),
                isNotNull(schema.songs.filename),
              ),
            )
            .orderBy(asc(schema.playlistTracks.position))
            .all();
        });

        if (tracks.length === 0) {
          yield* Effect.logDebug(
            `Playlist ${playlistId}: no downloaded tracks, skipping`,
          );
          return;
        }

        // Build M3U8 content
        const lines: string[] = ["#EXTM3U"];

        for (const track of tracks) {
          if (!track.filename) continue;

          // Probe FLAC duration
          const filePath = `${musicDir}/${track.filename}`;
          const duration = yield* getFlacDuration(filePath).pipe(
            Effect.catchAll((e) =>
              Effect.logWarning(
                `Could not probe duration for ${track.filename}: ${e}`,
              ).pipe(Effect.as(-1)),
            ),
          );

          // Build display title: "Song Name - Artist"
          const displayTitle = [track.songName, track.artistName]
            .filter(Boolean)
            .join(" - ");

          lines.push(`#EXTINF:${duration},${displayTitle}`);
          lines.push(`../${track.filename}`);
        }

        // Write the file (LF line endings, no BOM)
        const content = `${lines.join("\n")}\n`;
        const filePath = `${playlistsDir}/${playlistId}.m3u8`;

        yield* fs.writeFileString(filePath, content).pipe(
          Effect.mapError((e) =>
            FileSystemError.make({
              message: `Failed to write playlist file: ${e.message}`,
              path: filePath,
            }),
          ),
        );

        yield* Effect.logInfo(
          `Generated ${filePath} (${tracks.length} tracks)`,
        );
      },
    );

    /**
     * Delete .m3u8 files in the playlists directory that don't match
     * any tracked playlist ID.
     */
    const cleanupOrphanedFiles = Effect.fn("M3UService.cleanupOrphanedFiles")(
      function* (playlistsDir: string, trackedIds: string[]) {
        const entries = yield* fs
          .readDirectory(playlistsDir)
          .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

        const trackedSet = new Set(trackedIds);

        for (const entry of entries) {
          if (!entry.endsWith(".m3u8")) continue;

          const stem = entry.slice(0, -5); // Remove ".m3u8"
          if (!trackedSet.has(stem)) {
            const filePath = `${playlistsDir}/${entry}`;
            yield* fs.remove(filePath).pipe(
              Effect.tap(() =>
                Effect.logInfo(`Deleted orphaned playlist file: ${entry}`),
              ),
              Effect.catchAll((e) =>
                Effect.logWarning(
                  `Failed to delete orphaned file ${entry}: ${e}`,
                ),
              ),
            );
          }
        }
      },
    );

    return {
      generatePlaylists,
    };
  }),
}) {}
