import { Command } from "@effect/cli"
import { Effect } from "effect"
import { NotImplementedError } from "../../../domain/errors"

export const logoutCommand = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Token revocation not yet implemented")
    return yield* NotImplementedError.make({ command: "musync auth logout" })
  })
).pipe(Command.withDescription("Revoke tokens"))
