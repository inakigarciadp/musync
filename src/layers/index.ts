import { FetchHttpClient } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { ConfigProvider, Layer } from "effect";
import { OAuthHttpClientLive } from "../http/layers/oauth-http";
import { YouTubeApiHttpClientLive } from "../http/layers/youtube-api-http";
import { AuthService } from "../services/auth";
import { ConfigService } from "../services/config";
import { DatabaseService } from "../services/database";
import { SongExtractionService } from "../services/song-extraction";
import { SyncService } from "../services/sync";
import { YouTubeService } from "../services/youtube";

const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

const configServiceLayer = ConfigService.layer.pipe(
  Layer.provide(configProviderLayer),
  Layer.provide(BunFileSystem.layer),
);

const databaseServiceLayer = DatabaseService.Default.pipe(
  Layer.provide(configProviderLayer),
  Layer.provide(BunFileSystem.layer),
);

const extractionServiceLayer = SongExtractionService.Default.pipe(
  Layer.provide(configProviderLayer),
);

// OAuth HTTP client with base URL configured
const oauthHttpClientLayer = OAuthHttpClientLive.pipe(
  Layer.provide(FetchHttpClient.layer),
);

// Base layer providing AuthService with all its dependencies
const authServiceLayer = AuthService.layer.pipe(
  Layer.provide(configServiceLayer),
  Layer.provide(oauthHttpClientLayer),
  Layer.provide(BunFileSystem.layer),
);

// Compose the authenticated YouTube HTTP client with AuthService
const youtubeHttpClientLayer = YouTubeApiHttpClientLive.pipe(
  Layer.provide(authServiceLayer),
  Layer.provide(FetchHttpClient.layer),
);

// YouTubeService layer using the authenticated HTTP client
const youtubeServiceLayer = YouTubeService.layer.pipe(
  Layer.provide(youtubeHttpClientLayer),
);

const syncServiceLayer = SyncService.Default.pipe(
  Layer.provide(databaseServiceLayer),
  Layer.provide(youtubeServiceLayer),
  Layer.provide(extractionServiceLayer),
);

// Export both AuthService and YouTubeService for use by CLI commands
export const AppLayer = Layer.mergeAll(
  authServiceLayer,
  youtubeServiceLayer,
  databaseServiceLayer,
  syncServiceLayer,
);
