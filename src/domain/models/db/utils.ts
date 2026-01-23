import type { Schema } from "effect";

export function ensureSchema<
  TType,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for generic schema handling
  TSchema extends Schema.Schema<TType, any, any>,
>(schema: TSchema): TSchema {
  return schema;
}
