# musync CLI Specification

## Design Philosophy

**Goal**: Download and manage high-quality (FLAC) music from playlists (initially YouTube playlists), maintain metadata, enable ongoing sync to local or mobile devices.

**Principles**:

* Simple 99% case: `musync sync`
* Hidden complexity: DB/auth managed automatically
* Dev-friendly: rich inspection commands
* Safe defaults: no re-downloads, incremental updates
* Portable library: single folder for all songs, M3U8 playlists for organization

---

## Commands

### Setup & Auth

#### `musync init`

Interactive first-time setup.

* Triggers OAuth flow (if needed for sources)
* Prompts for defaults (output dir)
* Creates `~/.config/musync/` and `~/.local/share/musync/` structure

#### `musync auth login`

Manual authentication or API re-login.

* Opens browser or performs token exchange. If opening browser is not possible, provides URL to visit manually.
* Saves tokens to `~/.local/share/musync/credentials.json`

#### `musync auth logout`

Revoke tokens, delete credentials.

* Removes `~/.local/share/musync/credentials.json`
* Keeps config and database intact

#### `musync auth status`

Show authentication state.

* Displays: authentication status, token expiry time, time until expiry

---

### Main Operations

#### `musync sync`

Fetch metadata for tracked playlists + download new tracks.

* Updates database with new songs/metadata
* Downloads missing files only
* Shows progress + summary

**Options**:

* `--dry-run`: Preview changes without executing
* `--force`: Re-download all files
* `--metadata-only`: Update DB, skip downloads
* `--download-only`: Download from DB, skip API fetch
* `musync sync PLxxx`: Sync a specific playlist

---

### Playlist Management

#### `musync playlist add PLxxx [PLyyy ...]`

Start tracking playlist(s).

* Adds to database
* Fetches initial metadata
* Does **not** auto-download (run `musync sync` after)

#### `musync playlist remove PLxxx`

Stop tracking playlist.

* Removes from tracking list
* Keeps downloaded files (use `musync maintenance clean` to remove)

#### `musync playlist list`

Show tracked playlists.

* Columns: name, ID, total/downloaded songs, last sync time

---

### Inspection & Debugging

#### `musync playlists`

List **all** playlists from API.

* Shows tracked status with checkmark
* Includes video counts
* Options: `--tracked`, `--format json|table`

#### `musync tracks PLxxx`

Show tracks in a playlist.

* Format: title, ID, duration, status, file path
* Options:

  * `--downloaded`
  * `--missing`
  * `--limit N`
  * `--format json|table`

#### `musync status`

Combined status view.

* Auth state
* Last sync time
* Playlists tracked, songs downloaded, pending count

---

### Maintenance

#### `musync maintenance verify`

Check integrity.

* Finds missing or corrupted files

#### `musync maintenance clean`

Remove orphaned files.

* Deletes files not referenced in DB
* Interactive confirmation

#### `musync maintenance orphans`

List orphaned files (preview before `clean`)

#### `musync maintenance duplicates`

Find duplicate songs (same ID across playlists)

#### `musync maintenance validate PLxxx`

Verify all files exist for a specific playlist

#### `musync maintenance refetch PLxxx`

Force re-fetch metadata from API

---

### Configuration

#### `musync config set <key> <value>`

Set preference.

* Keys: `output`
* Example: `musync config set output ~/Music/musync/`

#### `musync config show`

Display current configuration.

#### `musync config reset`

Reset configuration to defaults.

---

## File Structure

Follows XDG Base Directory spec:

```
~/.config/musync/
└── config.json          # User preferences (output dir, format, quality)

~/.local/share/musync/
├── library.db           # SQLite: playlists, tracks, download status
├── credentials.json     # OAuth tokens (if applicable)
└── backups/
    └── library-2026-01-11.db
```

**Why XDG**:

* Respects Linux standards
* Keeps config separate from data
* Supports cross-platform paths via:

  * `XDG_CONFIG_HOME`, `XDG_DATA_HOME`
  * `%APPDATA%`, `%LOCALAPPDATA%`
  * `~/Library/Application Support`

---

## Download Organization

```
~/Music/musync/
├── track-01.flac
├── track-02.flac
├── track-03.flac
└── playlists/
    ├── Chill.m3u8
    ├── Workout.m3u8
    └── Sleep.m3u8
```

**Why**:

* All songs in a **single flat directory** → no duplicates
* Each playlist references songs via `.m3u8` file
* `.m3u8` files use relative paths for cross-device portability
* Simpler syncing to Android or other devices

Example `.m3u8`:

```
#EXTM3U
#EXTINF:203,Glass Animals - Heat Waves
../heat-waves.flac
#EXTINF:256,Tame Impala - The Less I Know The Better
../the-less-i-know.flac
```

---

## Output Formats

All list/export commands support `--format`:

* `table` (default)
* `json`
* `compact`

---

## Example Workflows

### Initial setup:

```bash
musync init
musync playlists
musync playlist add PLxxx PLyyy
musync sync
```

### Daily use:

```bash
musync sync
```

### Maintenance:

```bash
musync maintenance verify
musync maintenance clean
```

---

## Error Handling Principles

* **Fail gracefully**: skip bad items, continue
* **Retry network**: 3x exponential backoff
* **Atomic operations**: DB consistency guaranteed
* **User confirmation**: required for destructive actions

---

## Future Considerations

* `musync sync --schedule daily`: background cron support
* Album art embedding in FLAC
* Playlist templates/filters
* `musync stats --chart`: visual usage graphs
