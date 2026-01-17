# Developer guide

There is no build command in this project. Just run `bun index.ts <command>`.

If you need to learn about the Youtube API, search for links in the official [Youtube Data API v3](https://developers.google.com/youtube/v3/docs) documentation.

Use kebab-case for TypeScript files.

If you run into an error loop, look at existing patterns and implementations to see how are we doing things. If that does not work, use the btca subagent to ask for help.

# Project musync

This project uses bun for everything.

This project uses Effect for type-safe, composable runtime effects.

## Effect Best Practices

<!-- effect-solutions:start -->
**Before implementing Effect features**, run `effect-solutions list` and read the relevant guide.

Topics include: services and layers, data modeling, error handling, configuration, testing, HTTP clients, CLIs, observability, and project structure.

**Effect Source Reference:** Use the btca subagent to search for real implementations when docs aren't enough.
<!-- effect-solutions:end -->

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
│   │   │   └── status.ts
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
│   ├── formatters/
│   │   ├── table.ts
│   │   ├── json.ts
│   │   └── compact.ts
│   └── index.ts
├── services/
│   ├── Auth.ts                    # OAuth token management
│   ├── Config.ts                  # User preferences
│   ├── Database.ts                # SQLite operations
│   ├── Download.ts                # Coordinates downloading
│   ├── FileSystem.ts              # File operations
│   ├── M3U8.ts                    # Playlist file generation
│   ├── Metadata.ts                # FLAC tagging
│   └── YouTube.ts                 # YouTube API wrapper
├── http/
│   ├── clients/
│   │   ├── OAuthClient.ts         # For OAuth flow (Google OAuth endpoints)
│   │   ├── YouTubeApiClient.ts    # For YouTube Data API v3
│   │   └── DownloadClient.ts      # For yt-dlp or download service
│   ├── layers/
│   │   ├── OAuthClientLive.ts     # Production OAuth client layer
│   │   ├── YouTubeApiClientLive.ts # Production YouTube client layer
│   │   ├── DownloadClientLive.ts  # Production download client layer
│   │   └── index.ts               # Export all layers
│   └── models/
│       ├── OAuthModels.ts         # Token response, refresh, etc.
│       ├── YouTubeModels.ts       # Playlist, video, channel schemas
│       └── DownloadModels.ts      # Download progress, status
├── domain/
│   ├── models/
│   │   ├── Playlist.ts
│   │   ├── Track.ts
│   │   ├── Config.ts
│   │   └── Auth.ts
│   └── errors/
│       ├── AuthErrors.ts
│       ├── DatabaseErrors.ts
│       ├── DownloadErrors.ts
│       ├── FileSystemErrors.ts
│       └── YouTubeErrors.ts
├── infrastructure/
│   ├── db/
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   │   └── 001_initial.sql
│   │   └── queries.ts
│   ├── paths/
│   │   └── xdg.ts                 # XDG directory handling
│   └── oauth/
│       ├── flow.ts                # OAuth authorization flow
│       └── pkce.ts                # PKCE challenge generation
├── layers/
│   ├── app.ts                     # Main app layer composition
│   └── http.ts                    # HTTP client layers composition
```

## Implementation status

- `auth login` - OAuth2 PKCE flow with Youtube API v3.
- `auth logout` - Removes stored authentication tokens.
- `auth status` - Shows authentication state and token expiry.
- `playlists` - Lists the playlists associated to the auth'd user. Supports pagination via `--page-token` and limits via `--limit` (1-50, default 20). The `--format` and `--tracked` flags are not implemented yet.
- All other commands - stubs
