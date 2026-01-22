import { Console, Effect } from "effect";
import type { PlaylistListResponse } from "../../domain/models/youtube/playlist";
import type { TrackListResponse } from "../../domain/models/youtube/tracks";
import { bold, dim, formatDate, padRight, truncate } from "./utils";

const TITLE_WIDTH = 35;
const COUNT_WIDTH = 10;
const DATE_WIDTH = 14;
const CHANNEL_WIDTH = 20;
const POS_WIDTH = 5;
const ID_WIDTH = 15;

export const formatPlaylistTable = Effect.fnUntraced(function* (
  response: PlaylistListResponse,
) {
  const { items, nextPageToken } = response;

  yield* Console.log(
    bold(padRight("#", POS_WIDTH)) +
      bold(padRight("Title", TITLE_WIDTH)) +
      bold(padRight("Videos", COUNT_WIDTH)) +
      bold(padRight("Created", DATE_WIDTH)) +
      bold("ID"),
  );
  yield* Console.log(
    dim(
      "─".repeat(POS_WIDTH + TITLE_WIDTH + COUNT_WIDTH + DATE_WIDTH + ID_WIDTH),
    ),
  );

  let pos = 0;
  for (const playlist of items) {
    pos++;
    const title = truncate(playlist.snippet.title, TITLE_WIDTH - 2);
    const count = String(playlist.contentDetails.itemCount);
    const date = formatDate(playlist.snippet.publishedAt);
    const id = playlist.id;
    yield* Console.log(
      padRight(String(pos), POS_WIDTH) +
        padRight(title, TITLE_WIDTH) +
        padRight(count, COUNT_WIDTH) +
        padRight(date, DATE_WIDTH) +
        id,
    );
  }

  if (nextPageToken) {
    yield* Console.log("");
    yield* Console.log(dim(`Next page: --page-token ${nextPageToken}`));
  }
});

export const formatTrackTable = Effect.fnUntraced(function* (
  response: TrackListResponse,
) {
  const { items, nextPageToken } = response;

  yield* Console.log(
    bold(padRight("#", POS_WIDTH)) +
      bold(padRight("Title", TITLE_WIDTH)) +
      bold(padRight("Channel", CHANNEL_WIDTH)) +
      bold(padRight("Added", DATE_WIDTH)) +
      bold("ID"),
  );
  yield* Console.log(
    dim(
      "─".repeat(
        POS_WIDTH + TITLE_WIDTH + CHANNEL_WIDTH + DATE_WIDTH + ID_WIDTH,
      ),
    ),
  );

  for (const track of items) {
    const pos = String(track.snippet.position + 1);
    const title = truncate(track.snippet.title, TITLE_WIDTH - 2);
    const channel = truncate(
      track.snippet.videoOwnerChannelTitle ?? "Unknown",
      CHANNEL_WIDTH - 2,
    );
    const date = formatDate(track.snippet.publishedAt);
    const id = track.contentDetails.videoId;
    yield* Console.log(
      padRight(pos, POS_WIDTH) +
        padRight(title, TITLE_WIDTH) +
        padRight(channel, CHANNEL_WIDTH) +
        padRight(date, DATE_WIDTH) +
        id,
    );
  }

  if (nextPageToken) {
    yield* Console.log("");
    yield* Console.log(dim(`Next page: --page-token ${nextPageToken}`));
  }
});
