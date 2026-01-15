import { ConfigProvider, Layer } from "effect";
import { OAuthHttpClientLive } from "../http/layers/oauth-http";
import { AuthService } from "../services/auth";
import { ConfigService } from "../services/config";

const configProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

const configServiceLayer = ConfigService.layer.pipe(
  Layer.provide(configProviderLayer),
);

export const AppLayer = AuthService.layer.pipe(
  Layer.provide(configServiceLayer),
  Layer.provide(OAuthHttpClientLive),
);
