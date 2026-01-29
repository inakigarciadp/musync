import { Match } from "effect";
import type { Format } from "../../domain/models/format";
import type { PlaylistListResponse } from "../../domain/models/youtube/playlist";
import type { TrackListResponse } from "../../domain/models/youtube/tracks";
import { formatPlaylistCompact, formatTrackCompact } from "./compact";
import { formatJson } from "./json";
import { formatPlaylistTable, formatTrackTable } from "./table";

export type { Format } from "../../domain/models/format";

export const formatPlaylists = (
  response: PlaylistListResponse,
  format: Format,
) =>
  Match.value(format).pipe(
    Match.when("json", () => formatJson(response)),
    Match.when("table", () => formatPlaylistTable(response)),
    Match.when("compact", () => formatPlaylistCompact(response)),
    Match.exhaustive,
  );

export const formatTracks = (response: TrackListResponse, format: Format) =>
  Match.value(format).pipe(
    Match.when("json", () => formatJson(response)),
    Match.when("table", () => formatTrackTable(response)),
    Match.when("compact", () => formatTrackCompact(response)),
    Match.exhaustive,
  );

export * from "./utils";
