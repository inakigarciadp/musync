# Available commands
- `bun typecheck` for running TS type checking.
- `bun check` for running the linter.

## btca

When you need up-to-date information about technologies used in this project, use btca to query source repositories directly.

**Available resources**: effect

### Usage

```bash
btca ask -t <resource> -q "<question>"
```

## Error Handling System

Type-safe error handling with Effect. Errors are defined as `Schema.TaggedError` classes, collected into an `AppError` union (`src/domain/errors/index.ts`), and formatted via an exhaustive `Match.typeTags<AppError>()` matcher (`src/presentation/error-presentation.ts`). Adding a new error to the union causes a compile error until you handle it in the matcher.

### How errors flow

1. **Bubble up by default**: Commands don't catch errors. Unhandled errors reach `index.ts` where `handleCliError` formats them and exits with the right code.
2. **Retry at the call site**: Some operations retry transient failures before letting errors propagate. For example, the sync service (`src/services/sync.ts`) retries SongExtractionError, LucidaSearchError, DownloadUrlMatchingError, and LucidaDownloadError with exponential backoff and limits. CloudflareChallengeError is never retried - it indicates a blocker that requires user intervention.
3. **Graceful degradation**: After retries exhaust, some errors (search, AI matching, download) are caught and converted into user prompts or skip outcomes rather than failing the entire sync.

### Adding a new error

1. Define it in its domain file (e.g., `src/domain/errors/youtube.ts`).
2. Add it to `AppError` in `src/domain/errors/index.ts`.
3. Handle it in `src/presentation/error-presentation.ts` (compiler enforces this).

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication required |
| 4 | Resource not found |
| 5 | Rate limit exceeded |
| 6 | Service unavailable |
| 7 | Not implemented |
| 8 | Cloudflare challenge required |
| 130 | User interrupt (Ctrl+C) |

`DEBUG=1` shows stack traces.

## Architecture overview

Current project structure. Follow this layout but adapt as necessary.

```
index.ts                             # Entry point
src/
├── cli/
│   ├── commands/
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   ├── status.ts
│   │   │   └── refresh.ts
│   │   ├── cloudflare/
│   │   │   └── set.ts
│   │   ├── config/
│   │   │   ├── set.ts
│   │   │   ├── show.ts
│   │   │   └── reset.ts
│   │   ├── maintenance/
│   │   │   ├── clean.ts
│   │   │   ├── duplicates.ts
│   │   │   ├── orphans.ts
│   │   │   ├── refetch.ts
│   │   │   ├── validate.ts
│   │   │   └── verify.ts
│   │   ├── playlist/
│   │   │   ├── add.ts
│   │   │   ├── list.ts
│   │   │   └── remove.ts
│   │   ├── init.ts
│   │   ├── playlists.ts
│   │   ├── status.ts
│   │   ├── sync.ts
│   │   └── tracks.ts
│   └── index.ts
├── domain/
│   ├── errors/
│   │   ├── index.ts                 # AppError union type (all error types)
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   ├── database.ts
│   │   ├── download-url-matching.ts
│   │   ├── interactive.ts
│   │   ├── lucida.ts
│   │   ├── song-extraction.ts
│   │   ├── sync.ts
│   │   └── youtube.ts
│   └── models/
│       ├── auth.ts
│       ├── cloudflare.ts
│       ├── db/
│       │   ├── playlist.ts
│       │   └── utils.ts
│       ├── download-url-match.ts
│       ├── format.ts
│       ├── lucida.ts
│       ├── song.ts
│       ├── user-config.ts
│       └── youtube/
│           ├── playlist.ts
│           └── tracks.ts
├── http/
│   └── layers/
│       ├── lucida-http.ts           # For Lucida download service
│       ├── oauth-http.ts            # For OAuth flow (Google OAuth endpoints)
│       └── youtube-api-http.ts      # For YouTube Data API v3
├── infrastructure/
│   ├── db/
│   │   └── schema.ts               # Database schema definition
│   └── oauth/
│       ├── browser.ts              # Browser for OAuth flow
│       ├── callback-server.ts      # OAuth callback server
│       └── pkce.ts                 # PKCE challenge generation
├── layers/
│   └── index.ts                     # Layer composition
├── presentation/
│   ├── error-presentation.ts        # Centralized error formatting and exit codes
│   └── formatters/
│       ├── index.ts
│       ├── compact.ts
│       ├── json.ts
│       ├── table.ts
│       └── utils.ts
└── services/
    ├── auth.ts                      # OAuth token management
    ├── cloudflare-credentials.ts    # Cloudflare credentials management
    ├── config.ts                    # App configuration
    ├── database.ts                  # SQLite operations
    ├── download-url-matching.ts     # Download URL matching logic
    ├── flac-duration.ts             # FLAC duration extraction
    ├── lucida.ts                    # Lucida download service
    ├── m3u8.ts                      # Playlist file generation
    ├── paths.ts                     # File path management
    ├── song-extraction.ts           # Song metadata extraction
    ├── sync.ts                      # Playlist sync orchestration
    ├── user-config.ts               # User preferences
    └── youtube.ts                   # YouTube API wrapper
```
