import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";

/**
 * FLAC streaminfo metadata block layout (first 4 bytes are the fLaC marker):
 *
 * Offset 0-3:   "fLaC" magic number
 * Offset 4:     Block header byte (bit 0 = last-metadata-block flag, bits 1-7 = block type)
 * Offset 5-7:   Block length (3 bytes, big-endian)
 * Offset 8-9:   Minimum block size (samples)
 * Offset 10-11: Maximum block size (samples)
 * Offset 12-14: Minimum frame size (bytes)
 * Offset 15-17: Maximum frame size (bytes)
 * Offset 18-21: Sample rate (20 bits) | channels (3 bits) | bps (5 bits) | total samples high (4 bits)
 * Offset 22-25: Total samples low (32 bits)
 *
 * We need bytes 18-25 to extract sample rate and total samples.
 * Total read: 26 bytes.
 */
const FLAC_HEADER_SIZE = 26;
const FLAC_MAGIC = 0x664c6143; // "fLaC" as big-endian uint32

/**
 * Parse FLAC streaminfo bytes into a duration in seconds.
 * Returns -1 if the header is invalid or cannot be parsed.
 */
const parseDuration = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Verify magic number ("fLaC" = 0x664C6143)
  if (view.getUint32(0) !== FLAC_MAGIC) {
    return -1;
  }

  // Verify block type is STREAMINFO (type 0)
  const blockType = view.getUint8(4) & 0x7f;
  if (blockType !== 0) {
    return -1;
  }

  // Extract sample rate (20 bits starting at byte 18)
  // Read 3 bytes as: (byte18 << 12) | (byte19 << 4) | (byte20 >> 4)
  const sampleRate =
    (view.getUint8(18) << 12) |
    (view.getUint8(19) << 4) |
    (view.getUint8(20) >> 4);

  if (sampleRate === 0) {
    return -1;
  }

  // Extract total samples (36 bits):
  // - Lower 4 bits of byte 21 are the upper 4 bits of total samples
  // - Bytes 22-25 are the lower 32 bits
  const totalSamplesHigh = view.getUint8(21) & 0x0f;
  const totalSamplesLow = view.getUint32(22) >>> 0;

  const totalSamples = totalSamplesHigh * 2 ** 32 + totalSamplesLow;

  if (totalSamples === 0) {
    return -1;
  }

  return Math.round(totalSamples / sampleRate);
};

/**
 * Parse FLAC duration from a file by reading the streaminfo metadata block.
 * Returns duration in integer seconds (rounded), or -1 if parsing fails.
 *
 * Reads only the first 26 bytes of the file.
 */
export const getFlacDuration = Effect.fn("getFlacDuration")(function* (
  filePath: string,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const file = yield* fs.open(filePath, { flag: "r" });
      const maybeBytes = yield* file.readAlloc(FLAC_HEADER_SIZE);

      return Option.match(maybeBytes, {
        onNone: () => -1,
        onSome: (bytes) =>
          bytes.length < FLAC_HEADER_SIZE ? -1 : parseDuration(bytes),
      });
    }),
  );
});
