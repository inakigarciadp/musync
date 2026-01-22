import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../../domain/errors"

export const cleanCommand = Command.make("clean", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Clean not yet implemented")
    return yield* NotImplementedError.make({ command: "musync maintenance clean" })
  })
).pipe(Command.withDescription("Remove orphaned files"))
