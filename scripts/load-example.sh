#!/usr/bin/env bash
#
# Load the example podcast configuration into a running podcast-testcasts
# instance via POST /config, then print the feed URLs.
#
# Usage:
#   ./scripts/load-example.sh [config.json]
#
# Environment:
#   BASE_URL   Full base URL of the server (default: http://localhost:5004)
#   PORT       Port to use when BASE_URL is not set (default: 5004)
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:${PORT:-5004}}"
BASE_URL="${BASE_URL%/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${1:-$SCRIPT_DIR/../examples/config.json}"

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required but was not found" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "error: config file not found: $CONFIG_FILE" >&2
  exit 1
fi

echo "POST ${BASE_URL}/config  <-  ${CONFIG_FILE}"

response="$(curl -sS -w $'\n%{http_code}' -X POST "${BASE_URL}/config" \
  -H 'content-type: application/json' \
  --data-binary "@${CONFIG_FILE}")" || {
  echo "error: could not reach ${BASE_URL}. Is the server running?" >&2
  exit 1
}

status="${response##*$'\n'}"
body="${response%$'\n'*}"

if [[ "$status" != "200" ]]; then
  echo "error: request failed with HTTP ${status}" >&2
  echo "$body" >&2
  exit 1
fi

echo "ok: ${body}"
echo
echo "Feeds:"

if command -v jq >/dev/null 2>&1; then
  # Accept either a bare array or an object with a "podcasts" array.
  jq -r '(if type == "array" then . else .podcasts end)[]? | "  '"${BASE_URL}"'/\(.slug).rss"' "$CONFIG_FILE"
else
  # Fallback when jq is unavailable: pull slugs straight out of the JSON text.
  # "|" is the sed delimiter because the replacement contains "/".
  grep -oE '"slug"[[:space:]]*:[[:space:]]*"[^"]+"' "$CONFIG_FILE" \
    | sed -E "s|.*\"([^\"]+)\"$|  ${BASE_URL}/\1.rss|" || true
fi

echo
echo "Point your podcast client at one of the feed URLs above."
