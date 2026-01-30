import { Command } from "@effect/cli";
import { Effect } from "effect";
import { SyncService } from "../../services/sync";

export const syncCommand = Command.make(
  "sync",
  {},
  Effect.fnUntraced(function* () {
    // This command will do quite a few things:
    // 1. Sync playlists and its tracks to our database. In the same database transaction we will:
    //   - Delete everything from the join table
    //   - Fetch all tracked playlists from the database
    //   - For each playlist, fetch its tracks from the API and insert them both in the tracks table and in the join table.
    // 2. Using GPT OSS 120B we will extract the song's name and artist from each track's title and channel, if it does not exist in our database yet.

    // 3. For each track, we will use a service to find the song in the download sources (maybe we will use GPT OSS 120B for that as well) and update the track record with the download URL.

    // 4. We query the database for matches that need manual review (there is a database column for that) and prompt the user for them.

    // 5. After we have the names for all tracks, we will go and find th download URLs for each track for next step. It will be done through https://lucida.to/ via scraping. Using the song name and the artist name we will search for the song, and pass the results to an AI model (GPT OSS 120B) to pick the best match and extract the download URL. If the AI can't give an answer, we will prompt the user for manual review.

    // 6. Then, we will download all new tracks using the download URLs and store them in our local storage.

    // 7. Finally, we will generate the playlists files (M3U8) for the local media player to use.

    const syncService = yield* SyncService;

    // Step 1-2: Sync playlists and extract song metadata
    yield* syncService.syncPlaylistsToDb();
    yield* syncService.extractSongsWithAi();

    // Step 3-4: Handle manual review for song extraction
    yield* syncService.handleManualReview();

    // Step 5: Find download URLs via lucida.to (prompts user inline if AI unsure)
    yield* syncService.findDownloadUrls();

    yield* Effect.logInfo("Sync process completed");
  }),
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
