import { Schema } from "effect";

export const CodeVerifier = Schema.String.pipe(Schema.brand("CodeVerifier"));
export type CodeVerifier = typeof CodeVerifier.Type;

export const CodeChallenge = Schema.String.pipe(Schema.brand("CodeChallenge"));
export type CodeChallenge = typeof CodeChallenge.Type;

export const State = Schema.String.pipe(Schema.brand("State"));
export type State = typeof State.Type;

export const AccessToken = Schema.String.pipe(Schema.brand("AccessToken"));
export type AccessToken = typeof AccessToken.Type;

export const RefreshToken = Schema.String.pipe(Schema.brand("RefreshToken"));
export type RefreshToken = typeof RefreshToken.Type;

export const Seconds = Schema.Int.pipe(
  Schema.positive(),
  Schema.brand("Seconds"),
);
export type Seconds = typeof Seconds.Type;

export const Scope = Schema.String.pipe(Schema.brand("Scope"));
export type Scope = typeof Scope.Type;

export const TokenType = Schema.Literal("Bearer");
export type TokenType = typeof TokenType.Type;

export class PKCEPair extends Schema.Class<PKCEPair>("PKCEPair")({
  codeVerifier: CodeVerifier,
  codeChallenge: CodeChallenge,
  state: State,
}) {}

export class TokenResponse extends Schema.Class<TokenResponse>("TokenResponse")(
  {
    access_token: AccessToken,
    refresh_token: RefreshToken,
    expires_in: Seconds,
    scope: Scope,
    token_type: TokenType,
  },
) {}

export class StoredTokens extends Schema.Class<StoredTokens>("StoredTokens")({
  accessToken: AccessToken,
  refreshToken: RefreshToken,
  expiresAt: Schema.Date,
}) {
  get isExpired(): boolean {
    return new Date() >= this.expiresAt;
  }

  get timeUntilExpiry(): number {
    return this.expiresAt.getTime() - Date.now();
  }

  get timeUntilExpiryString(): string {
    const ms = this.timeUntilExpiry;
    if (ms <= 0) return "Expired";

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
}

export const StoredTokensFromJson = Schema.parseJson(StoredTokens);
export const StoredTokensToJson = Schema.encodedSchema(StoredTokensFromJson);
