import { Command, Args, Options } from "@effect/cli";
import { Effect } from "effect";
import { NotImplementedError } from "../domain/errors";
import { initCommand } from "./commands/init";
import { syncCommand, syncPlaylistCommand } from "./commands/sync";
import { statusCommand } from "./commands/status";
import { playlistsCommand } from "./commands/playlists";
import { tracksCommand } from "./commands/tracks";
import { loginCommand } from "./commands/auth/login";
import { logoutCommand } from "./commands/auth/logout";
import { authStatusCommand } from "./commands/auth/status";
import { configSetCommand } from "./commands/config/set";
import { configShowCommand } from "./commands/config/show";
import { configResetCommand } from "./commands/config/reset";
import { addPlaylistCommand } from "./commands/playlist/add";
import { removePlaylistCommand } from "./commands/playlist/remove";
import { listPlaylistsCommand } from "./commands/playlist/list";
import { verifyCommand } from "./commands/maintenance/verify";
import { cleanCommand } from "./commands/maintenance/clean";
import { orphansCommand } from "./commands/maintenance/orphans";
import { duplicatesCommand } from "./commands/maintenance/duplicates";
import { validateCommand } from "./commands/maintenance/validate";
import { refetchCommand } from "./commands/maintenance/refetch";

const authCommand = Command.make("auth", {}).pipe(
  Command.withSubcommands([loginCommand, logoutCommand, authStatusCommand]),
);

const configCommand = Command.make("config", {}).pipe(
  Command.withSubcommands([
    configSetCommand,
    configShowCommand,
    configResetCommand,
  ]),
);

const playlistCommand = Command.make("playlist", {}).pipe(
  Command.withSubcommands([
    addPlaylistCommand,
    removePlaylistCommand,
    listPlaylistsCommand,
  ]),
);

const maintenanceCommand = Command.make("maintenance", {}).pipe(
  Command.withSubcommands([
    verifyCommand,
    cleanCommand,
    orphansCommand,
    duplicatesCommand,
    validateCommand,
    refetchCommand,
  ]),
);

const musyncCommand = Command.make("musync", {}).pipe(
  Command.withDescription("Music sync utility for YouTube playlists"),
  Command.withSubcommands([
    initCommand,
    syncCommand,
    syncPlaylistCommand,
    statusCommand,
    playlistsCommand,
    tracksCommand,
    authCommand,
    configCommand,
    playlistCommand,
    maintenanceCommand,
  ]),
);

export { musyncCommand };
