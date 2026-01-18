import { Console, Effect } from "effect";
import type { PlaylistListResponse } from "../../domain/models/youtube/playlist";
import type { TrackListResponse } from "../../domain/models/youtube/tracks";
import { bold, dim, formatDate, pluralize } from "./utils";

export const formatPlaylistCompact = Effect.fnUntraced(function* (
  response: PlaylistListResponse,
) {
  const { items, nextPageToken } = response;

  for (let i = 0; i < items.length; i++) {
    const playlist = items[i];
    if (!playlist) continue;
    const num = i + 1;
    const count = playlist.contentDetails.itemCount;
    const date = formatDate(playlist.snippet.publishedAt);
    const id = playlist.id;

    yield* Console.log(bold(`${num}. ${playlist.snippet.title}`));

    yield* Console.log(
      dim(`   ${count} ${pluralize(count, "video")} • Created ${date}`),
    );

    yield* Console.log(dim(`   ID: ${id}`));

    yield* Console.log(dim(`   youtube.com/playlist?list=${id}`));

    if (i < items.length - 1) {
      yield* Console.log("");
    }
  }

  if (nextPageToken) {
    yield* Console.log("");
    yield* Console.log(dim(`Next page: --page-token ${nextPageToken}`));
  }
});

export const formatTrackCompact = Effect.fnUntraced(function* (
  response: TrackListResponse,
) {
  const { items, nextPageToken } = response;

  for (let i = 0; i < items.length; i++) {
    const track = items[i];
    if (!track) continue;
    const pos = track.snippet.position + 1;
    const title = track.snippet.title;
    const channel = track.snippet.videoOwnerChannelTitle ?? "Unknown";
    const date = formatDate(track.snippet.publishedAt);
    const videoId = track.contentDetails.videoId;

    yield* Console.log(bold(`${pos}. ${title}`));

    yield* Console.log(dim(`   by ${channel} • Added ${date}`));

    yield* Console.log(dim(`   ID: ${videoId}`));

    yield* Console.log(dim(`   youtube.com/watch?v=${videoId}`));

    if (i < items.length - 1) {
      yield* Console.log("");
    }
  }

  if (nextPageToken) {
    yield* Console.log("");
    yield* Console.log(dim(`Next page: --page-token ${nextPageToken}`));
  }
});
