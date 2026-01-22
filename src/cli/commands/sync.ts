import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { NotImplementedError } from "../../domain/errors";
import { PlaylistId } from "../../domain/models/playlist";

const dryRunOption = Options.boolean("dry-run").pipe(
  Options.withAlias("d"),
  Options.withDescription("Preview without executing"),
);

const forceOption = Options.boolean("force").pipe(
  Options.withAlias("f"),
  Options.withDescription("Re-download all tracks"),
);

const metadataOnlyOption = Options.boolean("metadata-only").pipe(
  Options.withAlias("m"),
  Options.withDescription("Skip downloads"),
);

const downloadOnlyOption = Options.boolean("download-only").pipe(
  Options.withAlias("D"),
  Options.withDescription("Skip API fetch"),
);

const playlistId = Args.text({ name: "playlistId" }).pipe(
  Args.withSchema(PlaylistId),
  Args.optional,
  Args.withDescription(
    "YouTube playlist ID to sync (optional, syncs all if not provided)",
  ),
);

export const syncCommand = Command.make(
  "sync",
  {
    playlistId,
    dryRun: dryRunOption,
    force: forceOption,
    metadataOnly: metadataOnlyOption,
    downloadOnly: downloadOnlyOption,
  },
  Effect.fnUntraced(function* ({
    playlistId,
    dryRun,
    force,
    metadataOnly,
    downloadOnly,
  }: {
    playlistId: Option.Option<string>;
    dryRun: boolean;
    force: boolean;
    metadataOnly: boolean;
    downloadOnly: boolean;
  }) {
    if (Option.isSome(playlistId)) {
      yield* Effect.logInfo(`Syncing playlist: ${playlistId.value}`);
      yield* Effect.logInfo("Playlist sync not yet implemented");
      return yield* NotImplementedError.make({ command: "musync sync" });
    } else {
      yield* Effect.logInfo("Syncing all playlists");
      yield* Effect.logInfo("Sync not yet implemented");
      return yield* NotImplementedError.make({ command: "musync sync" });
    }
  }),
).pipe(Command.withDescription("Fetch metadata and download new tracks"));
