import { Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"
import { musyncCommand } from "./src/cli"

const cli = Command.run(musyncCommand, { name: "musync", version: "0.1.0" })

const main = Effect.gen(function* () {
  yield* cli(process.argv)
}).pipe(Effect.provide(BunContext.layer))

BunRuntime.runMain(main)
