import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../../domain/errors";
import { PlaylistId } from "../../../domain/models/youtube/playlist";

export const addPlaylistCommand = Command.make(
  "add",
  {
    playlistIds: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.repeated,
      Args.withDescription("YouTube playlist IDs to track"),
    ),
  },
  Effect.fnUntraced(function* ({ playlistIds }: { playlistIds: string[] }) {
    yield* Effect.logInfo("Add playlist not yet implemented");
    return yield* NotImplementedError.make({
      command: "musync playlist add",
    });
  }),
).pipe(Command.withDescription("Track playlists"));
