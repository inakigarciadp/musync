import { Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { MaxResults } from "../../domain/models/youtube";
import { YouTubeService } from "../../services/youtube";

const trackedOption = Options.boolean("tracked").pipe(
  Options.withAlias("t"),
  Options.withDescription("Show only tracked playlists"),
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

const pageTokenOption = Options.text("page-token").pipe(
  Options.withDescription("Pagination token to fetch next page"),
  Options.optional,
);

const limitOption = Options.integer("limit").pipe(
  Options.withAlias("l"),
  Options.withDescription("Number of results per page (1-50)"),
  Options.withDefault(20),
  Options.withSchema(MaxResults),
);

export const playlistsCommand = Command.make(
  "playlists",
  {
    tracked: trackedOption,
    format: formatOption,
    pageToken: pageTokenOption,
    limit: limitOption,
  },
  ({ tracked, format, pageToken, limit }) =>
    Effect.gen(function* () {
      const youtube = yield* YouTubeService;
      const token = Option.getOrElse(pageToken, () => undefined);
      const response = yield* youtube.listPlaylists(token, limit);

      yield* Console.log(JSON.stringify(response, null, 2));
    }),
).pipe(Command.withDescription("List all playlists from API"));
