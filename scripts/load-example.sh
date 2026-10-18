#!/usr/bin/env bash
#
# Load the example podcast configuration into a running podcast-testcasts
# instance via POST /config, then print the feed URLs.
#
# Usage:
#   ./scripts/load-example.sh [base-url] [config-file]
#
# Arguments:
#   base-url     Server base URL (default: http://localhost:5004)
#   config-file  JSON config to POST (default: examples/config.json)
#
# Examples:
#   ./scripts/load-example.sh
#   ./scripts/load-example.sh http://192.168.1.10:5004
#   ./scripts/load-example.sh http://localhost:5004 examples/config.json
#   ./scripts/load-example.sh examples/config.json   # base URL defaults
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BASE_URL="http://localhost:5004"
DEFAULT_CONFIG="$SCRIPT_DIR/../examples/config.json"

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

# Let the config file be passed on its own (it is not a URL).
if [[ -n "${1:-}" && ! "$1" =~ ^https?:// && ( -f "$1" || "$1" == *.json ) ]]; then
  CONFIG_FILE="$1"
  shift
fi

BASE_URL="${1:-$DEFAULT_BASE_URL}"
CONFIG_FILE="${CONFIG_FILE:-${2:-$DEFAULT_CONFIG}}"
BASE_URL="${BASE_URL%/}"

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
