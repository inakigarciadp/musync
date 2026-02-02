import { Command } from "@effect/cli";
import { loginCommand } from "./commands/auth/login";
import { logoutCommand } from "./commands/auth/logout";
import { authRefreshCommand } from "./commands/auth/refresh";
import { authStatusCommand } from "./commands/auth/status";
import { cloudflareSetCommand } from "./commands/cloudflare/set";
import { configResetCommand } from "./commands/config/reset";
import { configSetCommand } from "./commands/config/set";
import { configShowCommand } from "./commands/config/show";
import { initCommand } from "./commands/init";
import { cleanCommand } from "./commands/maintenance/clean";
import { duplicatesCommand } from "./commands/maintenance/duplicates";
import { orphansCommand } from "./commands/maintenance/orphans";
import { refetchCommand } from "./commands/maintenance/refetch";
import { validateCommand } from "./commands/maintenance/validate";
import { verifyCommand } from "./commands/maintenance/verify";
import { addPlaylistCommand } from "./commands/playlist/add";
import { listPlaylistsCommand } from "./commands/playlist/list";
import { removePlaylistCommand } from "./commands/playlist/remove";
import { playlistsCommand } from "./commands/playlists";
import { statusCommand } from "./commands/status";
import { syncCommand } from "./commands/sync";
import { tracksCommand } from "./commands/tracks";

const authCommand = Command.make("auth", {}).pipe(
  Command.withSubcommands([
    loginCommand,
    logoutCommand,
    authStatusCommand,
    authRefreshCommand,
  ]),
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

const cloudflareCommand = Command.make("cloudflare", {}).pipe(
  Command.withSubcommands([cloudflareSetCommand]),
);

const musyncCommand = Command.make("musync", {}).pipe(
  Command.withDescription("Music sync utility for YouTube playlists"),
  Command.withSubcommands([
    initCommand,
    syncCommand,
    statusCommand,
    playlistsCommand,
    tracksCommand,
    authCommand,
    configCommand,
    playlistCommand,
    maintenanceCommand,
    cloudflareCommand,
  ]),
);

export { musyncCommand };
