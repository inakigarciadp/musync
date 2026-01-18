import { Schema } from "effect";

export const FormatSchema = Schema.Literal("json", "table", "compact");
export type Format = typeof FormatSchema.Type;
