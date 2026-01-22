import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../../domain/errors"

export const listPlaylistsCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("List playlists not yet implemented")
    return yield* NotImplementedError.make({ command: "musync playlist list" })
  })
).pipe(Command.withDescription("Show tracked playlists"))
