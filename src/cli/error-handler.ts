import { Console, Effect, Match } from "effect";
import type { AppError } from "../domain/errors";

// ANSI color codes
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

interface FormattedError {
  readonly title: string;
  readonly message?: string;
  readonly suggestion?: string;
  readonly exitCode: number;
}

// Type-safe exhaustive matcher - compile error if case is missing!
const formatError: (error: AppError) => FormattedError =
  Match.typeTags<AppError>()({
    // Auth errors
    AuthenticationRequiredError: (e) => ({
      title: "Not logged in",
      message: e.message,
      suggestion: "Run 'musync auth login' to authenticate.",
      exitCode: 2,
    }),
    PermissionDeniedError: (e) => ({
      title: "Permission denied",
      message: e.message,
      exitCode: 3,
    }),
    TokenStorageError: (e) => ({
      title: "Token storage error",
      message: e.reason,
      suggestion: "Try logging in again with 'musync auth login'.",
      exitCode: 2,
    }),
    PKCEGenerationError: (e) => ({
      title: "Authentication setup failed",
      message: e.reason,
      exitCode: 1,
    }),
    TokenExchangeError: () => ({
      title: "Authentication failed",
      message: "Could not exchange authorization code for tokens.",
      suggestion: "Try logging in again.",
      exitCode: 2,
    }),
    InvalidAuthorizationCodeError: () => ({
      title: "Invalid authorization",
      message: "The authorization code was rejected.",
      suggestion: "Try logging in again.",
      exitCode: 2,
    }),
    BrowserOpenError: (e) => ({
      title: "Could not open browser",
      message: `Failed to open: ${e.url}`,
      suggestion: "Open the URL manually in your browser.",
      exitCode: 1,
    }),
    ServerStartError: () => ({
      title: "Server error",
      message: "Could not start local authentication server.",
      exitCode: 1,
    }),
    AuthTimeoutError: (e) => ({
      title: "Authentication timed out",
      message: `No response received within ${e.timeoutMs / 1000} seconds.`,
      suggestion: "Try logging in again.",
      exitCode: 2,
    }),
    FileSystemError: (e) => ({
      title: "File system error",
      message: e.reason,
      exitCode: 1,
    }),

    // YouTube errors
    RateLimitError: (e) => ({
      title: "Rate limit exceeded",
      message: e.message,
      suggestion: "Wait a few minutes and try again.",
      exitCode: 5,
    }),
    ResourceNotFoundError: (e) => ({
      title: "Not found",
      message: `${e.resource}: ${e.message}`,
      exitCode: 4,
    }),
    YouTubeServiceUnavailableError: (e) => ({
      title: "YouTube unavailable",
      message: e.message,
      suggestion: "Try again later.",
      exitCode: 6,
    }),
    YouTubeNetworkError: (e) => ({
      title: "Network error",
      message: e.message,
      suggestion: "Check your internet connection.",
      exitCode: 1,
    }),
    ValidationError: (e) => ({
      title: "Validation error",
      message: e.message,
      exitCode: 1,
    }),
    PlaylistOperationUnsupportedError: (e) => ({
      title: "Operation not supported",
      message: e.message,
      exitCode: 1,
    }),
    YouTubeApiError: (e) => ({
      title: "YouTube API error",
      message: `(${e.statusCode}) ${e.message}`,
      exitCode: 1,
    }),

    // General errors
    NotImplementedError: (e) => ({
      title: "Not implemented",
      message: `The '${e.command}' command is not yet implemented.`,
      exitCode: 7,
    }),
    ParseError: () => ({
      title: "Unexpected response",
      message: "The server returned an unexpected response.",
      suggestion:
        "This may indicate an API change. Try 'musync auth login' if not authenticated.",
      exitCode: 1,
    }),
  });

export const handleCliError = (error: AppError) =>
  Effect.gen(function* () {
    const formatted = formatError(error);

    yield* Console.error("");
    yield* Console.error(red(`Error: ${formatted.title}`));

    if (formatted.message) {
      yield* Console.error(formatted.message);
    }

    if (formatted.suggestion) {
      yield* Console.error("");
      yield* Console.error(dim(formatted.suggestion));
    }

    yield* Console.error("");

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      yield* Console.error(dim("Stack trace:"));
      yield* Console.error(dim(String(error)));
    }

    return yield* Effect.fail({
      _tag: "ExitError" as const,
      exitCode: formatted.exitCode,
    });
  });

export const handleDefect = (defect: unknown) =>
  Effect.gen(function* () {
    yield* Console.error("");
    yield* Console.error(red("Error: Unexpected error occurred"));

    if (process.env.DEBUG) {
      yield* Console.error(dim(String(defect)));
    } else {
      yield* Console.error(dim("Set DEBUG=1 for more details."));
    }

    yield* Console.error("");
    return yield* Effect.fail({
      _tag: "ExitError" as const,
      exitCode: 1,
    });
  });
