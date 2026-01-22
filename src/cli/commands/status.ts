import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../domain/errors"

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Status check not yet implemented")
    return yield* NotImplementedError.make({ command: "musync status" })
  })
).pipe(Command.withDescription("Combined status view"))
