# musync 🎵

A high-performance CLI tool for syncing YouTube playlists to local high-quality FLAC files. Built with **Bun**, **Effect**, and the **YouTube V3 API**.

## 🚀 Design Philosophy
* **Simplicity First**: Run `musync sync` and let the tool handle the rest.
* **Smart Syncing**: Incremental updates that skip existing files and handle metadata automatically.
* **Portable Library**: A flat file structure with M3U8 playlists for easy transfer to mobile devices.
* **Robust Core**: Powered by **Effect** for type-safe error handling and resilient network operations.

## 🛠️ Tech Stack
* **Runtime**: [Bun](https://bun.sh)
* **Logic**: [Effect TS](https://effect.website)
* **Data Source**: YouTube Data API v3
* **Storage**: SQLite (via XDG-compliant paths)

## 📦 Installation
```bash
bun install -g musync

```

## 🚦 Quick Start

```bash
# Initialize configuration and authenticate
musync init

# View your YouTube playlists
musync playlists

# Track specific playlists
musync add PLxxx PLyyy

# Download and sync
musync sync

```

## 📖 Command Overview

### Main Operations

* `sync`: Fetch metadata and download missing tracks. Use `--dry-run` to preview.
* `add <id>`: Start tracking one or more playlists.
* `remove <id>`: Stop tracking a playlist (keeps downloaded files).
* `list`: Show currently tracked playlists and sync status.

### Inspection & Auth

* `auth [login|logout|refresh|status]`: Manage YouTube API credentials.
* `playlists`: List all your YouTube playlists.
* `tracks <playlistId>`: List tracks within a specific playlist.
* `status`: Summary of library size, auth state, and pending downloads.

### Maintenance

* `verify`: Check for missing or corrupted files.
* `clean`: Remove files no longer referenced in your database.
* `duplicates`: Find songs appearing in multiple playlists.

## 📂 File Structure

`musync` follows the **XDG Base Directory Specification**:

* **Config**: `~/.config/musync/config.json`
* **Data**: `~/.local/share/musync/library.db` (SQLite)
* **Downloads**:
```text
~/Music/musync/
├── track-01.flac       # Flat directory avoids duplicates
└── playlists/
    └── MyPlaylist.m3u8 # Relative paths for portability

```



## 🔧 Configuration

Set your download directory or preferences:

```bash
musync config set output ~/MyHighResMusic

```

## 🌍 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Show detailed stack traces on errors | `undefined` |
| `XDG_DATA_HOME` | Override XDG data directory | `~/.local/share` |
| `GOOGLE_CLIENT_ID` | YouTube OAuth client ID | (required) |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth client secret | (required) |

**Example:**

```bash
# Enable debug output
DEBUG=1 musync sync

# Use custom data directory
XDG_DATA_HOME=/custom/path musync sync
```
