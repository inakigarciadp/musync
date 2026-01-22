import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../domain/errors"

export const initCommand = Command.make("init", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Initialization not yet implemented")
    return yield* NotImplementedError.make({ command: "musync init" })
  })
).pipe(Command.withDescription("Interactive first-time setup"))
