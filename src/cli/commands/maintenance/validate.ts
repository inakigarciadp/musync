import { Args, Command } from "@effect/cli";
import { Effect, Schema } from "effect";
import { NotImplementedError } from "../../../domain/errors";
import { PlaylistId } from "../../../domain/models/Playlist";

export const validateCommand = Command.make(
  "validate",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID to validate"),
    ),
  },
  ({ playlistId }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Validate not yet implemented");
      return yield* NotImplementedError.make({
        command: "musync maintenance validate",
      });
    }),
).pipe(Command.withDescription("Verify playlist files"));
