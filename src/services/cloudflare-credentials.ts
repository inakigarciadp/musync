import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Schema } from "effect";
import { FileSystemError } from "../domain/errors/auth";
import {
  type CloudflareCredentials,
  CloudflareCredentialsFromJson,
} from "../domain/models/cloudflare";
import { PathsService } from "./paths";

export class CloudflareCredentialsService extends Effect.Service<CloudflareCredentialsService>()(
  "CloudflareCredentialsService",
  {
    accessors: true,
    dependencies: [PathsService.Default],
    effect: Effect.gen(function* () {
      const paths = yield* PathsService;
      const fs = yield* FileSystem.FileSystem;

      const getStoragePath = Effect.fn(
        "CloudflareCredentialsService.getStoragePath",
      )(function* () {
        const dataDir = yield* paths.getAppDataDir();
        return `${dataDir}/cloudflare.json`;
      });

      const loadCredentials = Effect.fn(
        "CloudflareCredentialsService.loadCredentials",
      )(function* () {
        const storagePath = yield* getStoragePath();

        const content = yield* fs.readFileString(storagePath).pipe(
          Effect.mapError((error: PlatformError) =>
            FileSystemError.make({
              message: `Failed to read cloudflare credentials: ${error.message}`,
              path: storagePath,
            }),
          ),
          Effect.catchTag("FileSystemError", (error) => {
            if (
              error.message.includes("NotFound") ||
              error.message.includes("ENOENT")
            ) {
              return Effect.succeed(null);
            }
            return Effect.fail(error);
          }),
        );

        if (content === null) {
          return null;
        }

        return yield* Schema.decodeUnknown(CloudflareCredentialsFromJson)(
          content,
        );
      });

      const storeCredentials = Effect.fn(
        "CloudflareCredentialsService.storeCredentials",
      )(function* (credentials: CloudflareCredentials) {
        const storagePath = yield* getStoragePath();
        const json = yield* Schema.encode(CloudflareCredentialsFromJson)(
          credentials,
        );

        yield* fs
          .writeFileString(storagePath, json, {
            mode: 0o600,
          })
          .pipe(
            Effect.mapError((error: PlatformError) =>
              FileSystemError.make({
                message: `Failed to store cloudflare credentials: ${error.message}`,
                path: storagePath,
              }),
            ),
          );
      });

      return { loadCredentials, storeCredentials };
    }),
  },
) {}
