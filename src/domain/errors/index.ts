import { Schema } from "effect";
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
  PermissionDeniedError,
  PlaylistOperationUnsupportedError,
  RateLimitError,
  ResourceNotFoundError,
  ValidationError,
  YouTubeApiError,
  YouTubeNetworkError,
  YouTubeServiceUnavailableError,
} from "./youtube-errors";

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
  | PermissionDeniedError
  | ResourceNotFoundError
  | RateLimitError
  | YouTubeServiceUnavailableError
  | YouTubeNetworkError
  | ValidationError
  | PlaylistOperationUnsupportedError
  | YouTubeApiError
  // General errors
  | NotImplementedError
  | ParseError;
