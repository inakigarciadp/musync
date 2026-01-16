import { Effect, Schema } from "effect";
import { PKCEGenerationError } from "../../domain/errors/auth";
import { CodeChallenge, CodeVerifier, State } from "../../domain/models/auth";

const base64UrlEncode = (buffer: Uint8Array): string => {
  let base64 = Buffer.from(buffer).toString("base64");
  base64 = base64.replace(/\+/g, "-");
  base64 = base64.replace(/\//g, "_");
  base64 = base64.replace(/=/g, "");
  return base64;
};

export const generateCodeVerifier = Effect.fn("generateCodeVerifier")(
  function* () {
    const bytes = yield* Effect.try({
      try: () => crypto.getRandomValues(new Uint8Array(32)),
      catch: (error) =>
        PKCEGenerationError.make({
          reason: `Failed to generate random bytes: ${error}`,
        }),
    });
    const plainValue = base64UrlEncode(bytes);
    return yield* Schema.decodeUnknown(CodeVerifier)(plainValue);
  },
);

export const generateCodeChallenge = Effect.fn("generateCodeChallenge")(
  function* (verifier: CodeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(String(verifier));
    const hash = yield* Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", data) as Promise<ArrayBuffer>,
      catch: (error) =>
        PKCEGenerationError.make({
          reason: `Failed to generate SHA-256 hash: ${error}`,
        }),
    });
    const plainValue = base64UrlEncode(new Uint8Array(hash));
    return yield* Schema.decodeUnknown(CodeChallenge)(plainValue);
  },
);

export const generateState = Effect.fn("generateState")(function* () {
  const plainValue = crypto.randomUUID();
  return yield* Schema.decodeUnknown(State)(plainValue);
});
