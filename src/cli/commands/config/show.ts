import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../../domain/errors"

export const configShowCommand = Command.make("show", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Config show not yet implemented")
    return yield* NotImplementedError.make({ command: "musync config show" })
  })
).pipe(Command.withDescription("Display config"))
