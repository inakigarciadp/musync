import { Command, Args, Options } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../domain/errors"

const dryRunOption = Options.boolean("dry-run").pipe(
  Options.withDescription("Preview without executing")
)

const forceOption = Options.boolean("force").pipe(
  Options.withDescription("Re-download all tracks")
)

const metadataOnlyOption = Options.boolean("metadata-only").pipe(
  Options.withDescription("Skip downloads")
)

const downloadOnlyOption = Options.boolean("download-only").pipe(
  Options.withDescription("Skip API fetch")
)

export const syncCommand = Command.make(
  "sync",
  { dryRun: dryRunOption, force: forceOption, metadataOnly: metadataOnlyOption, downloadOnly: downloadOnlyOption },
  ({ dryRun, force, metadataOnly, downloadOnly }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Sync not yet implemented")
      return yield* NotImplementedError.make({ command: "musync sync" })
    })
).pipe(Command.withDescription("Fetch metadata and download new tracks"))

export const syncPlaylistCommand = Command.make(
  "sync",
  { playlistId: Args.text({ name: "playlistId" }) },
  ({ playlistId }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Playlist sync not yet implemented")
      return yield* NotImplementedError.make({ command: "musync sync" })
    })
).pipe(Command.withDescription("Sync specific playlist"))
