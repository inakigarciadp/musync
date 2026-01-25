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

    // 4. Finally, we will download all new tracks using the download URLs and store them in our local storage.

    const syncService = yield* SyncService;

    yield* syncService.syncPlaylistsToDb;

    yield* syncService.extractSongsWithAi;

    yield* Effect.logInfo("Sync process completed");
  }),
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
