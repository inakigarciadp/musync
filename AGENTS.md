# Available commands
- `bun typecheck` for running TS type checking.
- `bun check` for running the linter.

# Developer guide

There is no build command in this project. Just run `bun index.ts <command>`. This project uses bun for everything. It also uses the Effect TS library for composable runtime effects.

If you need to learn about the Youtube API, search for links in the official [Youtube Data API v3](https://developers.google.com/youtube/v3/docs) documentation.

Use kebab-case for TypeScript files.

If you run into an error loop, look at existing patterns and implementations to see how are we doing things. If that does not work, use the btca subagent to ask for help.

## Error Handling System

The application uses a centralized, type-safe error handling system with Effect:

### Key Concepts

1. **AppError Union** (`src/domain/errors/index.ts`): All error types are combined into a single union type. This includes auth errors, YouTube errors, HTTP errors, CLI validation errors, and config errors.

2. **Exhaustive Matching** (`src/presentation/error-presentation.ts`): Uses `Match.typeTags<AppError>()` for compile-time exhaustiveness checking. If you add a new error to the union, the compiler will force you to handle it.

3. **No Per-Command Error Handling**: Commands should not catch errors. Let them bubble up to the entry point where the centralized handler formats them for users.

4. **Exit Codes**: Use `CliExitError` class to carry exit codes through Effect's type system. The `cliTeardown` function extracts these codes for proper process exit.

5. **Debug Mode**: Set `DEBUG=1` environment variable to show stack traces with `Cause.pretty()`.

### When Adding New Errors

1. Define the error in its domain file (e.g., `src/domain/errors/youtube.ts`).
2. Add it to the `AppError` union in `src/domain/errors/index.ts`.
3. Add a handler case in `src/presentation/error-presentation.ts` (compiler will enforce this).
4. Assign an appropriate exit code from the established convention.

### Exit Code Convention

| Code | Meaning |
|-------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication required |
| 4 | Resource not found |
| 5 | Rate limit exceeded |
| 6 | Service unavailable |
| 7 | Not implemented |

## Architecture overview

This is the initial proposed project structure. It may evolve over time or depending on the specific needs. Try to follow it but don't be afraid to adapt as necessary.

```
index.ts # Entry point
src/
├── cli/
│   ├── commands/
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   ├── status.ts
│   │   │   └── refresh.ts
│   │   ├── config/
│   │   │   ├── set.ts
│   │   │   ├── show.ts
│   │   │   └── reset.ts
│   │   ├── maintenance/
│   │   │   ├── verify.ts
│   │   │   ├── clean.ts
│   │   │   ├── orphans.ts
│   │   │   ├── duplicates.ts
│   │   │   ├── validate.ts
│   │   │   └── refetch.ts
│   │   ├── playlist/
│   │   │   ├── add.ts
│   │   │   ├── remove.ts
│   │   │   └── list.ts
│   │   ├── init.ts
│   │   ├── sync.ts
│   │   ├── playlists.ts
│   │   ├── tracks.ts
│   │   └── status.ts
│   └── index.ts
├── presentation/
│   ├── error-presentation.ts    # Centralized error formatting and exit codes
│   └── formatters/
│       ├── index.ts
│       ├── table.ts
│       ├── json.ts
│       ├── compact.ts
│       └── utils.ts
├── services/
│   ├── auth.ts                    # OAuth token management
│   ├── config.ts                  # User preferences
│   ├── youtube.ts                 # YouTube API wrapper
│   ├── database.ts                # SQLite operations
│   ├── download.ts                # Coordinates downloading
│   ├── file-system.ts             # File operations
│   ├── m3u8.ts                    # Playlist file generation
│   └── metadata.ts                # FLAC tagging
├── http/
│   └── layers/
│       ├── oauth-http.ts         # For OAuth flow (Google OAuth endpoints)
│       ├── youtube-api-http.ts    # For YouTube Data API v3
│       └── download-client.ts      # For yt-dlp or download service
├── domain/
│   ├── models/
│   │   ├── auth.ts
│   │   ├── format.ts
│   │   ├── config.ts
│   │   ├── track.ts
│   │   ├── playlist.ts
│   │   └── youtube/
│   │       ├── playlist.ts
│   │       └── tracks.ts
│   └── errors/
│       ├── index.ts                 # AppError union type (all error types)
│       ├── auth.ts
│       ├── youtube.ts
│       ├── database.ts
│       ├── download.ts
│       ├── file-system.ts
│       └── cli.ts
├── infrastructure/
│   ├── db/
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   │   └── 001_initial.sql
│   │   └── queries.ts
│   ├── paths/
│   │   └── xdg.ts                 # XDG directory handling
│   └── oauth/
│       ├── browser.ts             # Browser for OAuth flow
│       ├── callback-server.ts     # OAuth callback server
│       ├── pkce.ts                # PKCE challenge generation
│       └── flow.ts                # OAuth authorization flow
└── layers/
    └── index.ts                   # Layer composition
```

## Implementation status

- `auth login` - OAuth2 PKCE flow with Youtube API v3. Automatic token refresh when token expires within 5 minutes.
- `auth logout` - Removes stored authentication tokens.
- `auth refresh` - Manually force refresh the access token.
- `auth status` - Shows authentication state and token expiry.
- `playlists` - Lists the playlists associated to the auth'd user. Supports pagination via `--page-token`, limits via `--limit` (1-50, default 20), output formatting via `--format` (json|table|compact), and `--all` flag to fetch all playlists ignoring pagination. The `--tracked` flag is not implemented yet.
- `tracks` - Lists tracks from a YouTube playlist. Requires `playlist-id` argument. Supports pagination via `--page-token`, limits via `--limit` (1-50, default 20), output formatting via `--format` (json|table|compact), and `--all` flag to fetch all tracks ignoring pagination. The `--downloaded` and `--missing` flags are not implemented yet.
- All other commands - stubs
