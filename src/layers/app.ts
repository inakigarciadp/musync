import { ConfigProvider, Layer } from "effect";
import { OAuthHttpClientLive } from "../http/layers/oauth-http";
import { YouTubeApiHttpClientLive } from "../http/layers/youtube-api-http";
import { AuthService } from "../services/auth";
import { ConfigService } from "../services/config";
import { YouTubeService } from "../services/youtube";

const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

const configServiceLayer = ConfigService.layer.pipe(
  Layer.provide(configProviderLayer),
);

// Base layer providing AuthService with all its dependencies
const authServiceLayer = AuthService.layer.pipe(
  Layer.provide(configServiceLayer),
  Layer.provide(OAuthHttpClientLive),
);

// Compose the authenticated YouTube HTTP client with AuthService
const youtubeHttpClientLayer = YouTubeApiHttpClientLive.pipe(
  Layer.provide(authServiceLayer),
  Layer.provide(OAuthHttpClientLive),
);

// YouTubeService layer using the authenticated HTTP client
const youtubeServiceLayer = YouTubeService.layer.pipe(
  Layer.provide(youtubeHttpClientLayer),
);

// Export both AuthService and YouTubeService for use by CLI commands
export const AppLayer = Layer.merge(authServiceLayer, youtubeServiceLayer);
