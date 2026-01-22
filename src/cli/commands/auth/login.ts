import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const loginCommand = Command.make("login", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Authentication not yet implemented");
    return yield* NotImplementedError.make({ command: "musync auth login" });
  }),
).pipe(Command.withDescription("Manual authentication"));
