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

export const AppLayer = YouTubeService.layer.pipe(
  Layer.provide(YouTubeApiHttpClientLive),
  Layer.provide(AuthService.layer),
  Layer.provide(configServiceLayer),
  Layer.provide(OAuthHttpClientLive),
);
