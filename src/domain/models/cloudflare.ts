import { Schema } from "effect";

export class CloudflareCredentials extends Schema.Class<CloudflareCredentials>(
  "CloudflareCredentials",
)({
  cfClearance: Schema.String,
  userAgent: Schema.String,
}) {}

export const CloudflareCredentialsFromJson = Schema.parseJson(
  CloudflareCredentials,
);
