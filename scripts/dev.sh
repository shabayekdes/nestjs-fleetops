#!/usr/bin/env bash
# Development: start the API (http://localhost:3000) and the web app
# (http://localhost:3001) in one terminal. Each line is prefixed with [api] or
# [web]. Ctrl+C stops both; if one of them exits, the other is stopped too.
#
# Usage (from anywhere in the repository): scripts/dev.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for app in api web; do
  if [ ! -d "$root/apps/$app/node_modules" ]; then
    echo "apps/$app has no node_modules: run 'npm ci' in apps/$app first." >&2
    exit 1
  fi
done

# Keep colored output even though it goes through a pipe.
export FORCE_COLOR=1

# Stop a process and all its descendants, children first. npm does not always
# pass signals on to the servers it starts, so signalling npm is not enough.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" || true); do
    kill_tree "$child"
  done
  kill -TERM "$1" 2>/dev/null || true
}

# On exit (Ctrl+C, or either app stopping), stop everything this script started.
cleanup() {
  trap - EXIT INT TERM
  local child
  for child in $(pgrep -P $$ || true); do
    kill_tree "$child"
  done
}
trap cleanup EXIT INT TERM

run() {
  local name=$1 dir=$2
  shift 2
  (cd "$root/$dir" && exec "$@") 2>&1 | sed -u "s/^/[$name] /" &
}

run api apps/api npm run start:dev
run web apps/web npm run dev

# Return as soon as either app exits; the EXIT trap stops the other one.
wait -n
