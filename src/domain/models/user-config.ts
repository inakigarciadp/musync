import { Schema } from "effect";

export const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";

export class UserConfig extends Schema.Class<UserConfig>("UserConfig")({
  cerebrasModel: Schema.optionalWith(Schema.String, {
    default: () => DEFAULT_CEREBRAS_MODEL,
  }),
  outputDirectory: Schema.NullOr(Schema.String),
}) {}

export const ValidConfigKeys = ["cerebrasModel", "outputDirectory"] as const;
export type ValidConfigKey = (typeof ValidConfigKeys)[number];

export const isValidConfigKey = (key: string): key is ValidConfigKey =>
  ValidConfigKeys.includes(key as ValidConfigKey);
