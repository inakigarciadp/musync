import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { ConfigProvider, Layer } from "effect";
import { OAuthHttpClientLive } from "../http/layers/oauth-http";
import { YouTubeApiHttpClientLive } from "../http/layers/youtube-api-http";
import { AuthService } from "../services/auth";
import { ConfigService } from "../services/config";
import { DatabaseService } from "../services/database";
import { PathsService } from "../services/paths";
import { SongExtractionService } from "../services/song-extraction";
import { SyncService } from "../services/sync";
import { YouTubeService } from "../services/youtube";

// Infrastructure - provided at app root
const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

// OAuth HTTP client (no service deps - just base URL config)
const oauthHttpClientLayer = OAuthHttpClientLive.pipe(
  Layer.provide(FetchHttpClient.layer),
);

// Services that depend only on infrastructure
const pathsServiceLayer = PathsService.Default.pipe(
  Layer.provide(BunFileSystem.layer),
  Layer.provide(configProviderLayer),
);

const configServiceLayer = ConfigService.Default.pipe(
  Layer.provide(pathsServiceLayer),
  Layer.provide(configProviderLayer),
);

const databaseServiceLayer = DatabaseService.Default.pipe(
  Layer.provide(pathsServiceLayer),
  Layer.provide(configProviderLayer),
);

const extractionServiceLayer = SongExtractionService.Default.pipe(
  Layer.provide(configProviderLayer),
);

// AuthService depends on ConfigService
const authServiceLayer = AuthService.Default.pipe(
  Layer.provide(configServiceLayer),
  Layer.provide(oauthHttpClientLayer),
  Layer.provide(BunFileSystem.layer),
);

// YouTube API HTTP client depends on AuthService for token injection
const youtubeHttpClientLayer = YouTubeApiHttpClientLive.pipe(
  Layer.provide(authServiceLayer),
  Layer.provide(FetchHttpClient.layer),
);

// YouTubeService uses the authenticated HTTP client
const youtubeServiceLayer = YouTubeService.Default.pipe(
  Layer.provide(youtubeHttpClientLayer),
);

// SyncService depends on multiple services
const syncServiceLayer = SyncService.Default.pipe(
  Layer.provide(databaseServiceLayer),
  Layer.provide(youtubeServiceLayer),
  Layer.provide(extractionServiceLayer),
);

// Infrastructure layers - provided at the bottom to close all leaked dependencies
const infrastructureLayer = Layer.mergeAll(
  BunFileSystem.layer,
  FetchHttpClient.layer,
  configProviderLayer,
);

// Export combined layer for CLI commands
export const AppLayer = Layer.mergeAll(
  authServiceLayer,
  youtubeServiceLayer,
  databaseServiceLayer,
  syncServiceLayer,
).pipe(Layer.provide(infrastructureLayer));
