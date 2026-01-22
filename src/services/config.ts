import { Config, Context, Effect, Layer, type Redacted, Schema } from "effect";
import { getAppDataDir } from "../infrastructure/paths/xdg";

const GoogleClientId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^[0-9]+-[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/),
  Schema.brand("GoogleClientId"),
);
type GoogleClientId = typeof GoogleClientId.Type;

export class ConfigService extends Context.Tag("@app/ConfigService")<
  ConfigService,
  {
    readonly clientId: GoogleClientId;
    readonly clientSecret: Redacted.Redacted;
    readonly tokenStoragePath: string;
  }
>() {
  static readonly layer = Layer.effect(
    ConfigService,
    Effect.gen(function* () {
      const clientId = yield* Schema.Config("GOOGLE_CLIENT_ID", GoogleClientId);
      const clientSecret = yield* Schema.Config(
        "GOOGLE_CLIENT_SECRET",
        Schema.Redacted(Schema.String.pipe(Schema.minLength(1))),
      );
      const dataDir = yield* getAppDataDir();

      return ConfigService.of({
        clientId,
        clientSecret,
        tokenStoragePath: `${dataDir}/tokens.json`,
      });
    }),
  );
}
