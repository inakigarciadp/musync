import { Config, Context, Effect, Layer, type Redacted } from "effect";
import { getAppDataDir } from "../infrastructure/paths/xdg";

export class ConfigService extends Context.Tag("@app/ConfigService")<
  ConfigService,
  {
    readonly getClientId: Effect.Effect<string>;
    readonly getClientSecret: Effect.Effect<Redacted.Redacted>;
    readonly getTokenStoragePath: Effect.Effect<string>;
  }
>() {
  static readonly layer = Layer.effect(
    ConfigService,
    Effect.gen(function* () {
      const clientId = yield* Config.string("GOOGLE_CLIENT_ID");
      const clientSecret = yield* Config.redacted("GOOGLE_CLIENT_SECRET");
      const dataDir = yield* getAppDataDir;

      const getClientId = Effect.succeed(clientId);
      const getClientSecret = Effect.succeed(clientSecret);
      const getTokenStoragePath = Effect.succeed(`${dataDir}/tokens.json`);

      return ConfigService.of({
        getClientId,
        getClientSecret,
        getTokenStoragePath,
      });
    }),
  );
}
