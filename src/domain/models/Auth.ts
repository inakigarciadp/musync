import { Schema } from "effect";

export class PKCEPair extends Schema.Class<PKCEPair>("PKCEPair")({
  codeVerifier: Schema.String,
  codeChallenge: Schema.String,
  state: Schema.String,
}) {}

export class TokenResponse extends Schema.Class<TokenResponse>("TokenResponse")(
  {
    access_token: Schema.String,
    refresh_token: Schema.String,
    expires_in: Schema.Number,
    scope: Schema.String,
    token_type: Schema.String,
  },
) {}

export class StoredTokens extends Schema.Class<StoredTokens>("StoredTokens")({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.DateFromSelf,
}) {}
