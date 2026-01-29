import { Effect, type Redacted, Schema } from "effect";
import { PathsService } from "./paths";

const GoogleClientId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^[0-9]+-[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/),
  Schema.brand("GoogleClientId"),
);
type GoogleClientId = typeof GoogleClientId.Type;

export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    accessors: true,
    dependencies: [PathsService.Default],
    effect: Effect.gen(function* () {
      const paths = yield* PathsService;

      const getConfig = Effect.fn("ConfigService.getConfig")(function* () {
        const clientId = yield* Schema.Config(
          "GOOGLE_CLIENT_ID",
          GoogleClientId,
        );
        const clientSecret = yield* Schema.Config(
          "GOOGLE_CLIENT_SECRET",
          Schema.Redacted(Schema.String.pipe(Schema.minLength(1))),
        );
        const dataDir = yield* paths.getAppDataDir();

        return {
          clientId,
          clientSecret,
          tokenStoragePath: `${dataDir}/tokens.json`,
        };
      });

      // Return the config values directly
      const config = yield* getConfig();
      return {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tokenStoragePath: config.tokenStoragePath,
      }
    }),
  },
) {}
