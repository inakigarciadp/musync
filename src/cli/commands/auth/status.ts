import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const authStatusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Auth status check not yet implemented");
    return yield* NotImplementedError.make({ command: "musync auth status" });
  }),
).pipe(Command.withDescription("Show auth state"));
