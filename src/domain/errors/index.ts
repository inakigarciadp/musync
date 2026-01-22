import type { ValidationError as CliValidationError } from "@effect/cli/ValidationError";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import { Schema } from "effect";
import type { ConfigError } from "effect/ConfigError";
import type { ParseError } from "effect/ParseResult";

// Auth errors
import type {
  AuthTimeoutError,
  BrowserOpenError,
  FileSystemError,
  InvalidAuthorizationCodeError,
  PKCEGenerationError,
  ServerStartError,
  TokenExchangeError,
  TokenStorageError,
} from "./auth";

// YouTube errors
import type {
  AuthenticationRequiredError,
  PlaylistOperationUnsupportedError,
  RateLimitError,
  ResourceNotFoundError,
  ValidationError,
  YouTubeApiError,
  YouTubeNetworkError,
  YouTubeServiceUnavailableError,
} from "./youtube";

export class NotImplementedError extends Schema.TaggedError<NotImplementedError>()(
  "NotImplementedError",
  {
    command: Schema.String,
  },
) {}

// Union type of all application errors for centralized error handling
export type AppError =
  // Auth errors
  | PKCEGenerationError
  | TokenExchangeError
  | InvalidAuthorizationCodeError
  | BrowserOpenError
  | ServerStartError
  | AuthTimeoutError
  | FileSystemError
  | TokenStorageError
  // YouTube errors
  | AuthenticationRequiredError
  | ResourceNotFoundError
  | RateLimitError
  | YouTubeServiceUnavailableError
  | YouTubeNetworkError
  | ValidationError
  | PlaylistOperationUnsupportedError
  | YouTubeApiError
  // HTTP errors (from @effect/platform)
  | HttpClientError
  // CLI validation errors (from @effect/cli)
  | CliValidationError
  // Config errors (from effect) - these have _tag: "ConfigError" with _op to distinguish
  | ConfigError
  // General errors
  | NotImplementedError
  | ParseError;
