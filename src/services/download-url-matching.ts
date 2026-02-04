import { createCerebras } from "@ai-sdk/cerebras";
import { jsonSchema as aiJsonSchema, generateText, Output } from "ai";
import { Config, Effect, JSONSchema, Redacted, Schema } from "effect";
import { DownloadUrlMatchingError } from "../domain/errors/download-url-matching";
import { DownloadUrlMatch } from "../domain/models/download-url-match";
import type { LucidaTrack } from "../domain/models/lucida";
import { UserConfigService } from "./user-config";

export class DownloadUrlMatchingService extends Effect.Service<DownloadUrlMatchingService>()(
  "DownloadUrlMatchingService",
  {
    accessors: true,
    dependencies: [UserConfigService.Default],
    effect: Effect.gen(function* () {
      const apiKey = yield* Config.redacted("CEREBRAS_API_KEY");
      const userConfig = yield* UserConfigService;
      const cerebrasModel = yield* userConfig.getCerebrasModel();
      const cerebras = createCerebras({
        apiKey: Redacted.value(apiKey),
      });

      const pickBestMatch = Effect.fn(
        "DownloadUrlMatchingService.pickBestMatch",
      )(function* (
        song: { songName: string; artistName: string },
        searchResults: LucidaTrack[],
      ) {
        if (searchResults.length === 0) {
          return { selectedIndex: null };
        }

        const effectJsonSchema = JSONSchema.make(DownloadUrlMatch);

        const resultsText = searchResults
          .map(
            (r, i) =>
              `${i}: "${r.name}" by ${r.artist}${r.album ? ` (Album: ${r.album})` : ""}`,
          )
          .join("\n");

        const result = yield* Effect.tryPromise({
          try: () =>
            generateText({
              model: cerebras(cerebrasModel),
              output: Output.object({
                schema: aiJsonSchema(effectJsonSchema),
              }),
              prompt: `You are matching a song to search results from Tidal (music streaming service).

Song to match:
- Song Name: "${song.songName}"
- Artist: "${song.artistName}"

Search Results from Tidal:
${resultsText}

Rules:
- Return the index (0-based) of the result that best matches the song, or null if none match confidently
- The song name and artist must match closely - minor variations like "(Remastered)" or "Live" are acceptable
- If the artist is completely different, return null
- If multiple results match equally well, prefer the first one
- Do not guess - only return an index if you are confident about the match
- If the song name has "Live", and one of the results also has "Live", prefer that one.
- If uncertain, return null`,
            }),
          catch: (cause) =>
            DownloadUrlMatchingError.make({
              message: `Failed to match via AI SDK: ${String(cause)}`,
              cause,
              isRateLimit:
                (typeof cause === "object" &&
                  cause !== null &&
                  "statusCode" in cause &&
                  cause.statusCode === 429) ||
                String(cause).includes("limit exceeded"),
              songName: song.songName,
              artistName: song.artistName,
            }),
        });

        return yield* Schema.decodeUnknown(DownloadUrlMatch)(
          result.output,
        ).pipe(
          Effect.mapError((e) =>
            DownloadUrlMatchingError.make({
              message: `Failed to parse AI output: ${e.message}`,
              cause: e,
              songName: song.songName,
              artistName: song.artistName,
            }),
          ),
        );
      });

      return { pickBestMatch };
    }),
  },
) {}
