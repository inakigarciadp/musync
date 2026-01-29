import { Schema } from "effect";

export class PKCEGenerationError extends Schema.TaggedError<PKCEGenerationError>()(
  "PKCEGenerationError",
  {
    message: Schema.String,
  },
) {}

export class TokenExchangeError extends Schema.TaggedError<TokenExchangeError>()(
  "TokenExchangeError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class InvalidAuthorizationCodeError extends Schema.TaggedError<InvalidAuthorizationCodeError>()(
  "InvalidAuthorizationCodeError",
  {
    message: Schema.String,
    statusCode: Schema.Number,
    body: Schema.String,
  },
) {}

export class BrowserOpenError extends Schema.TaggedError<BrowserOpenError>()(
  "BrowserOpenError",
  {
    message: Schema.String,
    url: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class ServerStartError extends Schema.TaggedError<ServerStartError>()(
  "ServerStartError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class AuthTimeoutError extends Schema.TaggedError<AuthTimeoutError>()(
  "AuthTimeoutError",
  {
    message: Schema.String,
    timeoutMs: Schema.Number,
  },
) {}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  "FileSystemError",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  },
) {}

export class TokenStorageError extends Schema.TaggedError<TokenStorageError>()(
  "TokenStorageError",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  },
) {}

export class TokenRefreshError extends Schema.TaggedError<TokenRefreshError>()(
  "TokenRefreshError",
  {
    message: Schema.String,
  },
) {}
