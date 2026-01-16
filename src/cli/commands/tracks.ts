import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../domain/errors";
import { PlaylistId } from "../../domain/models/playlist";

const downloadedOption = Options.boolean("downloaded").pipe(
  Options.withAlias("d"),
  Options.withDescription("Show only downloaded tracks"),
);

const missingOption = Options.boolean("missing").pipe(
  Options.withAlias("m"),
  Options.withDescription("Show only missing tracks"),
);

const limitOption = Options.integer("limit").pipe(
  Options.withDescription("Limit number of results"),
  Options.optional,
);

const formatOption = Options.choice("format", [
  "json",
  "table",
  "compact",
]).pipe(
  Options.withAlias("f"),
  Options.withDescription("Output format"),
  Options.withDefault("table"),
);

export const tracksCommand = Command.make(
  "tracks",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID"),
    ),
    downloaded: downloadedOption,
    missing: missingOption,
    limit: limitOption,
    format: formatOption,
  },
  ({ playlistId, downloaded, missing, limit, format }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Tracks listing not yet implemented");
      return yield* NotImplementedError.make({
        command: "musync tracks",
      });
    }),
).pipe(Command.withDescription("Show tracks in playlist"));
