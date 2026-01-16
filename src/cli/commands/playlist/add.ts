import { Args, Command } from "@effect/cli";
import { Effect, Schema } from "effect";
import { NotImplementedError } from "../../../domain/errors";
import { PlaylistId } from "../../../domain/models/Playlist";

export const addPlaylistCommand = Command.make(
  "add",
  {
    playlistIds: Args.text({ name: "playlistId" })
      .pipe(Args.withSchema(PlaylistId))
      .pipe(Args.repeated)
      .pipe(Args.withDescription("YouTube playlist IDs to track")),
  },
  ({ playlistIds }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Add playlist not yet implemented");
      return yield* NotImplementedError.make({
        command: "musync playlist add",
      });
    }),
).pipe(Command.withDescription("Track playlists"));
