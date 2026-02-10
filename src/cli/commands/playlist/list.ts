import { Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { DatabaseService } from "../../../services/database";

export const listPlaylistsCommand = Command.make(
  "list",
  {
    format: Options.choice("format", ["json", "table", "compact"]).pipe(
      Options.withAlias("f"),
      Options.withDescription("Output format (not yet implemented)"),
      Options.withDefault("table"),
    ),
  },
  Effect.fnUntraced(function* () {
    const { runQuery, schema } = yield* DatabaseService;

    const playlists = yield* runQuery(async (db) =>
      db.select().from(schema.playlists),
    );

    if (playlists.length === 0) {
      yield* Console.log("No tracked playlists.");
      return;
    }

    yield* Console.log("Tracked Playlists:");
    for (const playlist of playlists) {
      const label = playlist.name
        ? `${playlist.name} (${playlist.id})`
        : playlist.id;
      yield* Console.log(
        `- ${label} (added on: ${playlist.createdAt.toISOString()})`,
      );
    }
  }),
).pipe(Command.withDescription("Show tracked playlists"));
