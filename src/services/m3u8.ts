import { FileSystem } from "@effect/platform";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Effect } from "effect";
import { FileSystemError } from "../domain/errors/auth";
import { DuplicatePlaylistNameError } from "../domain/errors/sync";
import { DatabaseService } from "./database";
import { getFlacDuration } from "./flac-duration";
import { UserConfigService } from "./user-config";

/**
 * Sanitize a playlist name for use as a filename.
 * Replaces filesystem-unsafe characters with underscores and trims whitespace.
 */
const sanitizeFilename = (name: string): string =>
  name
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

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
     * 3. Write the .m3u8 file to <musicDir>/playlists/<playlist name>.m3u8
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

        // Get all tracked playlists with names
        const trackedPlaylists = yield* runQuery(async (db) => {
          return await db
            .select({ id: schema.playlists.id, name: schema.playlists.name })
            .from(schema.playlists)
            .all();
        });

        yield* Effect.logInfo(
          `Generating M3U8 playlists for ${trackedPlaylists.length} tracked playlists`,
        );

        // Build filename mapping and check for duplicates
        const filenameToIds = new Map<string, string[]>();
        const playlistFilenames = new Map<string, string>();

        for (const playlist of trackedPlaylists) {
          // name is guaranteed non-null after the validation above
          const sanitized = sanitizeFilename(playlist.name as string);
          const existing = filenameToIds.get(sanitized) ?? [];
          existing.push(playlist.id);
          filenameToIds.set(sanitized, existing);
          playlistFilenames.set(playlist.id, sanitized);
        }

        // Check for duplicate sanitized names
        for (const [name, ids] of filenameToIds) {
          if (ids.length > 1) {
            return yield* DuplicatePlaylistNameError.make({
              message: `Multiple playlists would produce the same filename "${name}.m3u8": ${ids.join(", ")}`,
              duplicateName: name,
              playlistIds: ids,
            });
          }
        }

        // Collect expected filenames for orphan cleanup
        const expectedFilenames = new Set(
          [...playlistFilenames.values()].map((name) => `${name}.m3u8`),
        );

        // Generate each playlist file
        for (const playlist of trackedPlaylists) {
          const filename = playlistFilenames.get(playlist.id) as string;
          yield* generatePlaylistFile(
            playlist.id,
            filename,
            musicDir,
            playlistsDir,
            schema,
            runQuery,
          );
        }

        // Clean up orphaned .m3u8 files
        yield* cleanupOrphanedFiles(playlistsDir, expectedFilenames);

        yield* Effect.logInfo("M3U8 playlist generation completed");
      },
    );

    /**
     * Generate a single M3U8 playlist file.
     */
    const generatePlaylistFile = Effect.fn("M3UService.generatePlaylistFile")(
      function* (
        playlistId: string,
        playlistFilename: string,
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
            `Playlist ${playlistFilename}: no downloaded tracks, skipping`,
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
        const filePath = `${playlistsDir}/${playlistFilename}.m3u8`;

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
     * any expected playlist filename.
     */
    const cleanupOrphanedFiles = Effect.fn("M3UService.cleanupOrphanedFiles")(
      function* (playlistsDir: string, expectedFilenames: Set<string>) {
        const entries = yield* fs
          .readDirectory(playlistsDir)
          .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

        for (const entry of entries) {
          if (!entry.endsWith(".m3u8")) continue;

          if (!expectedFilenames.has(entry)) {
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
