import { Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  RateLimitError,
  YouTubeServiceUnavailableError,
} from "../../domain/errors/youtube-errors";
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

export const playlistsCommand = Command.make(
  "playlists",
  {
    tracked: trackedOption,
    format: formatOption,
    pageToken: pageTokenOption,
  },
  ({ tracked, format, pageToken }) =>
    Effect.gen(function* () {
      const youtube = yield* YouTubeService;
      const token = Option.getOrElse(pageToken, () => undefined);
      const response = yield* youtube.listPlaylists(token);

      yield* Console.log(JSON.stringify(response, null, 2));

      if (response.nextPageToken) {
        yield* Console.log(
          `\nMore playlists available. Use --page-token=${response.nextPageToken} to get next page.`,
        );
      }
    }).pipe(
      Effect.catchTags({
        AuthenticationRequiredError: (error) =>
          Effect.gen(function* () {
            yield* Console.error(error.message);
          }),
        PermissionDeniedError: (error) =>
          Effect.gen(function* () {
            yield* Console.error(error.message);
          }),
        RateLimitError: (error) =>
          Effect.gen(function* () {
            yield* Console.error(error.message);
          }),
        YouTubeServiceUnavailableError: (error) =>
          Effect.gen(function* () {
            yield* Console.error(error.message);
          }),
      }),
    ),
).pipe(Command.withDescription("List all playlists from API"));
