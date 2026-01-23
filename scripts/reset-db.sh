#!/usr/bin/env bash
set -e

rm -f ~/.local/share/musync/*db*
echo "Database deleted."

rm -rf ./drizzle
echo "Drizzle folder deleted."

bun run db:push
echo "Database schema pushed."
