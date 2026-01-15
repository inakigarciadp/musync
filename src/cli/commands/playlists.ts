import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../../domain/errors";

const trackedOption = Options.boolean("tracked").pipe(
  Options.withDescription("Show only tracked playlists"),
);

const formatOption = Options.choice("format", [
  "json",
  "table",
  "compact",
]).pipe(Options.withDescription("Output format"), Options.withDefault("table"));

export const playlistsCommand = Command.make(
  "playlists",
  { tracked: trackedOption, format: formatOption },
  ({ tracked, format }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Playlists listing not yet implemented");
      return yield* NotImplementedError.make({ command: "musync playlists" });
    }),
).pipe(Command.withDescription("List all playlists from API"));
