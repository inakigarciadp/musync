import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../domain/errors";

export const syncCommand = Command.make(
  "sync",
  {},
  Effect.fnUntraced(function* () {
    yield* Effect.logInfo("Syncing all playlists");
    yield* Effect.logInfo("Sync not yet implemented");
    return yield* NotImplementedError.make({ command: "musync sync" });
  }),

  // This command will do a lot of things:
  // 1. Sync playlists and its tracks to our database. In the same database transaction we will:
  //   - Delete everything from the join table
  //   - Fetch all tracked playlists from the database
  //   - For each playlist, fetch its tracks from the API and insert them both in the tracks table and in the join table.

  // 2. Using GPT OSS 120B we will extract the songname and artist from each track's title and channel, if it does not exist in our database yet.

  // 3. For each track, we will use a service to find the song in the download sources (maybe we will use GPT OSS 120B for that as well) and update the track record with the download URL.

  // 4. Finally, we will download all new tracks using the download URLs and store them in our local storage.
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
