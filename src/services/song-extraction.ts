import { createCerebras } from "@ai-sdk/cerebras";
import { jsonSchema as aiJsonSchema, generateText, Output } from "ai";
import { Config, Effect, JSONSchema, Redacted, Schema } from "effect";
import { SongExtractionError } from "../domain/errors/song-extraction";
import { SongExtraction } from "../domain/models/song";

export class SongExtractionService extends Effect.Service<SongExtractionService>()(
  "SongExtractionService",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const apiKey = yield* Config.redacted("CEREBRAS_API_KEY");
      const cerebras = createCerebras({
        apiKey: Redacted.value(apiKey),
      });

      const extractSongMetadata = Effect.fn(
        "SongExtractionService.extractSongMetadata",
      )(function* (title: string, channelTitle: string | null) {
        const effectJsonSchema = JSONSchema.make(SongExtraction);

        const result = yield* Effect.tryPromise({
          try: () =>
            generateText({
              model: cerebras("gpt-oss-120b"),
              output: Output.object({
                schema: aiJsonSchema(effectJsonSchema),
              }),
              prompt: `Extract the song name and artist name from this YouTube video information.

Title: ${title}
Channel: ${channelTitle ?? "Unknown"}

Rules:
- If this is clearly a music video or song, extract the song name and artist
- If the title contains "Artist - Song" format, parse accordingly  
- If the channel is a music artist (not VEVO, Topic, or generic), consider it as the artist.
- When the channel is in the format \`whatever - Topic\`, then whatever is always the artist name.
- In the artist name, extract the actual artistic name. For example, in The Jimi Hendrix Experience - Little Wing (Official Audio), the artist should be \`Jimi Hendrix\`.
- If you cannot confidently determine either field, return null for that field
- Do not guess - only return values you are confident about`,
            }),
          catch: (cause) =>
            SongExtractionError.make({
              message: `Failed to extract metadata via AI SDK: ${String(cause)}`,
              cause,
              isRateLimit:
                (typeof cause === "object" &&
                  cause !== null &&
                  "statusCode" in cause &&
                  cause.statusCode === 429) ||
                String(cause).includes("limit exceeded"),
              trackTitle: title,
            }),
        });

        return yield* Schema.decodeUnknown(SongExtraction)(result.output).pipe(
          Effect.mapError((e) =>
            SongExtractionError.make({
              message: `Failed to parse AI output: ${e.message}`,
              cause: e,
              trackTitle: title,
            }),
          ),
        );
      });

      return { extractSongMetadata };
    }),
  },
) {}
