import { Command } from "@effect/cli";
import { Effect } from "effect";
import { DownloadUrlResolutionService } from "../../services/download-url-resolution";
import { M3UService } from "../../services/m3u8";
import { MetadataExtractionService } from "../../services/metadata-extraction";
import { PlaylistSyncService } from "../../services/playlist-sync";
import { SongDownloadService } from "../../services/song-download";

export const syncCommand = Command.make(
  "sync",
  {},
  Effect.fnUntraced(function* () {
    // This command will do quite a few things:
    // 1. Sync playlists and their tracks to our database. In the same database transaction we will:
    //   - Delete everything from the join table
    //   - Fetch all tracked playlists from the database
    //   - For each playlist, fetch its tracks from the API and insert them both in the tracks table and in the join table.
    // 2. For each track, extract the song's name and artist from the track's title and channel using GPT OSS 120B (if not already present in the database).
    // 3. Query the database for matches that need manual review (there is a database column for that) and prompt the user for them.
    // 4. For tracks missing download URLs, search for the song on https://lucida.to/ using the song name and artist.
    //    Use an AI model (GPT OSS 120B) to pick the best match and extract the download URL. If the AI can't give an answer, prompt the user for manual review.
    // 5. Download all new tracks using the download URLs and store them in local storage.
    // 6. Generate the playlist files (M3U8) for the local media player to use.

    // Step 1: Sync playlists and tracks to DB
    yield* PlaylistSyncService.syncToDb();

    // Step 2: Extract song metadata with AI
    yield* MetadataExtractionService.extractAll();

    // Step 3: Handle manual review for song extraction
    yield* MetadataExtractionService.handleManualReview();

    // Step 4: Find download URLs via lucida.to (prompts user inline if AI unsure)
    yield* DownloadUrlResolutionService.resolveAll();

    // Step 5: Download songs
    yield* SongDownloadService.downloadAll();

    // Step 6: Generate M3U8 playlist files
    yield* M3UService.generatePlaylists();

    yield* Effect.logInfo("Sync process completed");
  }),
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
