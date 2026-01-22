import { Command, Args } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../../domain/errors"

export const removePlaylistCommand = Command.make("remove", { playlistId: Args.text({ name: "playlistId" }) }, ({ playlistId }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Remove playlist not yet implemented")
    return yield* NotImplementedError.make({ command: "musync playlist remove" })
  })
).pipe(Command.withDescription("Stop tracking playlist"))
