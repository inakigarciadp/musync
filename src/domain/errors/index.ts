import type { ValidationError as CliValidationError } from "@effect/cli/ValidationError";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import type { QuitException } from "@effect/platform/Terminal";
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
  TokenRefreshError,
  TokenStorageError,
} from "./auth";
// User config errors
import type {
  ConfigNotFoundError,
  ConfigReadError,
  ConfigValidationError,
  ConfigWriteError,
} from "./config";
// Database errors
import type { DatabaseError } from "./database";
// Download URL matching errors
import type { DownloadUrlMatchingError } from "./download-url-matching";
// Interactive prompt errors
import type { UserInterruptError } from "./interactive";
// Lucida errors
import type {
  CloudflareChallengeError,
  LucidaParseError,
  LucidaSearchError,
} from "./lucida";
// Song extraction errors
import type { SongExtractionError } from "./song-extraction";
// Sync errors
import type { RateLimitExceededError, UrlParseError } from "./sync";
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
  | TokenRefreshError
  // YouTube errors
  | AuthenticationRequiredError
  | ResourceNotFoundError
  | RateLimitError
  | YouTubeServiceUnavailableError
  | YouTubeNetworkError
  | ValidationError
  | PlaylistOperationUnsupportedError
  | YouTubeApiError
  // Database errors
  | DatabaseError
  // User config errors
  | ConfigNotFoundError
  | ConfigReadError
  | ConfigWriteError
  | ConfigValidationError
  // Download URL matching errors
  | DownloadUrlMatchingError
  // Lucida errors
  | LucidaSearchError
  | LucidaParseError
  | CloudflareChallengeError
  // Song extraction errors
  | SongExtractionError
  // Sync errors
  | RateLimitExceededError
  | UrlParseError
  // HTTP errors (from @effect/platform)
  | HttpClientError
  // CLI validation errors (from @effect/cli)
  | CliValidationError
  // Config errors (from effect) - these have _tag: "ConfigError" with _op to distinguish
  | ConfigError
  // General errors
  | NotImplementedError
  | ParseError
  // Interactive errors
  | UserInterruptError
  // Terminal prompt errors (Ctrl+C during interactive prompts)
  | QuitException;
