import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { AppLayer } from "./src/layers"
import { musyncCommand } from "./src/cli"
import { cliTeardown, handleCliError, handleDefect } from "./src/presentation/error-presentation"
import type { AppError } from "./src/domain/errors"

const layers = Layer.merge(AppLayer, BunContext.layer)

BunRuntime.runMain(
  Command.run(musyncCommand, { name: "musync", version: "0.1.0" })(process.argv).pipe(
    Effect.provide(layers),
    Effect.catchAll((error: AppError) => handleCliError(error)),
    Effect.catchAllDefect(handleDefect)
  ),
  { teardown: cliTeardown, disableErrorReporting: true }
)
