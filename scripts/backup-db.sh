#!/usr/bin/env bash
set -e

DB_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/musync/musync.db"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    exit 1
fi

BACKUP_PATH="${DB_PATH%.db}_backup_$(date +%Y%m%d_%H%M%S).db"
echo "Backing up database to $BACKUP_PATH..."
cp "$DB_PATH" "$BACKUP_PATH"