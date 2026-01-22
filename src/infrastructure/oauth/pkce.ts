import { Effect } from "effect";
import { PKCEGenerationError } from "../../domain/errors/auth-errors";

const base64UrlEncode = (buffer: Uint8Array): string => {
  let base64 = Buffer.from(buffer).toString("base64");
  base64 = base64.replace(/\+/g, "-");
  base64 = base64.replace(/\//g, "_");
  base64 = base64.replace(/=/g, "");
  return base64;
};

export const generateCodeVerifier = Effect.gen(function* () {
  const bytes = yield* Effect.try({
    try: () => crypto.getRandomValues(new Uint8Array(32)),
    catch: (error) =>
      PKCEGenerationError.make({
        reason: `Failed to generate random bytes: ${error}`,
      }),
  });
  return base64UrlEncode(bytes);
});

export const generateCodeChallenge = (verifier: string) =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = yield* Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", data) as Promise<ArrayBuffer>,
      catch: (error) =>
        PKCEGenerationError.make({
          reason: `Failed to generate SHA-256 hash: ${error}`,
        }),
    });
    return base64UrlEncode(new Uint8Array(hash));
  });

export const generateState = Effect.gen(function* () {
  return crypto.randomUUID();
});
