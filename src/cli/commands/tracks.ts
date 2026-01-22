import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { FormatSchema } from "../../domain/models/format";
import { MaxResults, PlaylistId } from "../../domain/models/youtube/playlist";
import { formatTracks } from "../../presentation/formatters";
import { YouTubeService } from "../../services/youtube";

const formatOption = Options.choice("format", [
  "json",
  "table",
  "compact",
]).pipe(
  Options.withAlias("f"),
  Options.withDescription("Output format"),
  Options.withDefault("table"),
  Options.withSchema(FormatSchema),
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

const allOption = Options.boolean("all").pipe(
  Options.withAlias("a"),
  Options.withDescription("Fetch all tracks (ignore pagination)"),
);

export const tracksCommand = Command.make(
  "tracks",
  {
    playlistId: Args.text({ name: "playlistId" }).pipe(
      Args.withSchema(PlaylistId),
      Args.withDescription("YouTube playlist ID"),
    ),
    format: formatOption,
    pageToken: pageTokenOption,
    limit: limitOption,
    all: allOption,
  },
  Effect.fnUntraced(function* ({ playlistId, format, pageToken, limit, all }) {
    const youtube = yield* YouTubeService;
    const response = yield* all
      ? youtube.listAllPlaylistItems(playlistId)
      : youtube.listPlaylistItems(
          playlistId,
          Option.getOrElse(pageToken, () => undefined),
          limit,
        );
    yield* formatTracks(response, format);
  }),
).pipe(Command.withDescription("List tracks from a playlist"));
