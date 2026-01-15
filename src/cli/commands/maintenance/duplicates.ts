import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const duplicatesCommand = Command.make("duplicates", {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Duplicates not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync maintenance duplicates",
    });
  }),
).pipe(Command.withDescription("Find duplicates"));
