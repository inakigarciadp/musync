import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { ConfigProvider, Layer, Logger, LogLevel } from "effect";
import { LucidaHttpClientLive } from "../http/layers/lucida-http";
import { OAuthHttpClientLive } from "../http/layers/oauth-http";
import { YouTubeApiHttpClientLive } from "../http/layers/youtube-api-http";
import { AuthService } from "../services/auth";
import { CloudflareCredentialsService } from "../services/cloudflare-credentials";
import { ConfigService } from "../services/config";
import { DatabaseService } from "../services/database";
import { DownloadUrlMatchingService } from "../services/download-url-matching";
import { LucidaService } from "../services/lucida";
import { PathsService } from "../services/paths";
import { SongExtractionService } from "../services/song-extraction";
import { SyncService } from "../services/sync";
import { YouTubeService } from "../services/youtube";

// Infrastructure - provided at app root
const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

// Logger configuration - DEBUG=1 enables debug level logs
const loggerLayer =
  process.env.DEBUG === "1"
    ? Logger.minimumLogLevel(LogLevel.Debug)
    : Logger.minimumLogLevel(LogLevel.Info);

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

// Cloudflare credentials service (for bypassing Cloudflare challenges)
const cloudflareCredentialsServiceLayer =
  CloudflareCredentialsService.Default.pipe(
    Layer.provide(pathsServiceLayer),
    Layer.provide(BunFileSystem.layer),
  );

// Lucida HTTP client (depends on CloudflareCredentialsService for cf_clearance)
const lucidaHttpClientLayer = LucidaHttpClientLive.pipe(
  Layer.provide(cloudflareCredentialsServiceLayer),
  Layer.provide(FetchHttpClient.layer),
);

// Lucida scraping service
const lucidaServiceLayer = LucidaService.Default.pipe(
  Layer.provide(lucidaHttpClientLayer),
);

// Download URL matching service (uses AI)
const downloadUrlMatchingServiceLayer = DownloadUrlMatchingService.Default.pipe(
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
  Layer.provide(lucidaServiceLayer),
  Layer.provide(downloadUrlMatchingServiceLayer),
);

// Infrastructure layers - provided at the bottom to close all leaked dependencies
const infrastructureLayer = Layer.mergeAll(
  BunFileSystem.layer,
  FetchHttpClient.layer,
  configProviderLayer,
  loggerLayer,
);

// Export combined layer for CLI commands
export const AppLayer = Layer.mergeAll(
  authServiceLayer,
  youtubeServiceLayer,
  databaseServiceLayer,
  syncServiceLayer,
  cloudflareCredentialsServiceLayer,
).pipe(Layer.provide(infrastructureLayer));
