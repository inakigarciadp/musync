import { Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";

export const orphansCommand = Command.make(
  "orphans",
  {},
  Effect.fnUntraced(function* () {
    yield* Effect.logInfo("Orphans not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync maintenance orphans",
    });
  }),
).pipe(Command.withDescription("List orphaned files"));
