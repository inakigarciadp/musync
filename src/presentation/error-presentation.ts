import type { Teardown } from "@effect/platform/Runtime";
import { Cause, Config, Console, Effect, Exit, Match } from "effect";
import type { AppError } from "../domain/errors";

// ANSI color codes
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// Tagged error to carry exit code through the Effect system
export class CliExitError {
  readonly _tag = "CliExitError";
  constructor(readonly exitCode: number) {}
}

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

    // HTTP errors (from @effect/platform)
    RequestError: (e) => ({
      title: "Network request failed",
      message: e.message,
      suggestion: "Check your internet connection.",
      exitCode: 1,
    }),
    ResponseError: (e) => ({
      title: "Server error",
      message: `HTTP ${e.response.status}: ${e.message}`,
      exitCode: 1,
    }),

    // CLI validation errors (from @effect/cli) - these are user input errors
    CommandMismatch: () => ({
      title: "Unknown command",
      message: "The specified command was not recognized.",
      suggestion: "Run 'musync --help' to see available commands.",
      exitCode: 1,
    }),
    CorrectedFlag: () => ({
      title: "Invalid flag",
      message: "A flag was not recognized but a similar one exists.",
      suggestion: "Run 'musync --help' to see available options.",
      exitCode: 1,
    }),
    HelpRequested: () => ({
      title: "Help",
      exitCode: 0,
    }),
    InvalidArgument: () => ({
      title: "Invalid argument",
      message: "An argument was invalid.",
      exitCode: 1,
    }),
    InvalidValue: () => ({
      title: "Invalid value",
      message: "A provided value was invalid.",
      exitCode: 1,
    }),
    MissingValue: () => ({
      title: "Missing value",
      message: "A required value was not provided.",
      exitCode: 1,
    }),
    MissingFlag: () => ({
      title: "Missing flag",
      message: "A required flag was not provided.",
      exitCode: 1,
    }),
    MissingSubcommand: () => ({
      title: "Missing subcommand",
      message: "A subcommand is required.",
      suggestion: "Run 'musync --help' to see available commands.",
      exitCode: 1,
    }),
    MultipleValuesDetected: () => ({
      title: "Multiple values",
      message: "Only one value was expected but multiple were provided.",
      exitCode: 1,
    }),
    NoBuiltInMatch: () => ({
      title: "No match",
      message: "Could not match the provided input.",
      exitCode: 1,
    }),
    UnclusteredFlag: () => ({
      title: "Invalid flag format",
      message: "Flags must be properly formatted.",
      exitCode: 1,
    }),

    // Config errors (from effect) - _tag is "ConfigError", _op distinguishes variants
    ConfigError: () => ({
      title: "Configuration error",
      message: "A configuration error occurred.",
      exitCode: 1,
    }),
  });

/**
 * Handles application errors by displaying a user-friendly message
 * and failing with a CliExitError containing the appropriate exit code.
 */
export const handleCliError = (error: AppError) =>
  Effect.gen(function* () {
    const debug = yield* Config.boolean("DEBUG").pipe(
      Config.orElse(() => Config.succeed(false)),
    );
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
    if (debug) {
      yield* Console.error(dim("Stack trace:"));
      yield* Console.error(dim(Cause.pretty(Cause.fail(error))));
    }

    // Fail with CliExitError - the custom teardown will extract the exit code
    return yield* Effect.fail(new CliExitError(formatted.exitCode));
  });

/**
 * Handles unexpected defects (programming errors, uncaught exceptions).
 */
export const handleDefect = (defect: unknown) =>
  Effect.gen(function* () {
    const debug = yield* Config.boolean("DEBUG").pipe(
      Config.orElse(() => Config.succeed(false)),
    );
    yield* Console.error("");
    yield* Console.error(red("Error: Unexpected error occurred"));

    if (debug) {
      yield* Console.error(dim("Stack trace:"));
      yield* Console.error(dim(Cause.pretty(Cause.die(defect))));
    } else {
      yield* Console.error(dim("Set DEBUG=1 for more details."));
    }

    yield* Console.error("");
    return yield* Effect.fail(new CliExitError(1));
  });

/**
 * Custom teardown that extracts exit codes from CliExitError.
 * This is the idiomatic Effect way to handle CLI exit codes.
 */
export const cliTeardown: Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit)) {
    onExit(0);
  } else if (Cause.isInterruptedOnly(exit.cause)) {
    // User interrupted (Ctrl+C)
    onExit(0);
  } else {
    // Extract exit code from CliExitError if present
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some" && failure.value instanceof CliExitError) {
      onExit(failure.value.exitCode);
    } else {
      // Default to exit code 1 for other failures
      onExit(1);
    }
  }
};
