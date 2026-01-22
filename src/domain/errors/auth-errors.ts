import { Schema } from "effect";

export class PKCEGenerationError extends Schema.TaggedError<PKCEGenerationError>()(
  "PKCEGenerationError",
  {
    reason: Schema.String,
  },
) {}

export class TokenExchangeError extends Schema.TaggedError<TokenExchangeError>()(
  "TokenExchangeError",
  {
    error: Schema.Defect,
  },
) {}

export class InvalidAuthorizationCodeError extends Schema.TaggedError<InvalidAuthorizationCodeError>()(
  "InvalidAuthorizationCodeError",
  {
    statusCode: Schema.Number,
    body: Schema.String,
  },
) {}

export class BrowserOpenError extends Schema.TaggedError<BrowserOpenError>()(
  "BrowserOpenError",
  {
    url: Schema.String,
    error: Schema.Defect,
  },
) {}

export class ServerStartError extends Schema.TaggedError<ServerStartError>()(
  "ServerStartError",
  {
    error: Schema.Defect,
  },
) {}

export class AuthTimeoutError extends Schema.TaggedError<AuthTimeoutError>()(
  "AuthTimeoutError",
  {
    timeoutMs: Schema.Number,
  },
) {}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  "FileSystemError",
  {
    reason: Schema.String,
  },
) {}

export class TokenStorageError extends Schema.TaggedError<TokenStorageError>()(
  "TokenStorageError",
  {
    reason: Schema.String,
  },
) {}
