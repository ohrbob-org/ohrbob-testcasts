#!/usr/bin/env bash
#
# Build and push the podcast-testcasts image to Docker Hub.
#
# Usage:
#   ./scripts/publish.sh [options] [tag]
#
# Arguments:
#   tag   Image tag to publish (default: latest)
#
# Options:
#   -u, --user USER   Docker Hub username (default: $DOCKERHUB_USER)
#   --token TOKEN     Docker Hub personal access token (default: $DOCKERHUB_PAT)
#   -h, --help        Show this help
#
# Environment:
#   IMAGE           Image repository (default: kaiwegner/ohrbob.testcasts)
#   DOCKERHUB_USER  Docker Hub username used together with DOCKERHUB_PAT
#   DOCKERHUB_PAT   Docker Hub personal access token
#
# Examples:
#   ./scripts/publish.sh
#   ./scripts/publish.sh 1.2.0
#   DOCKERHUB_USER=kaiwegner DOCKERHUB_PAT=... ./scripts/publish.sh 1.2.0
#   ./scripts/publish.sh --user kaiwegner --token ... 1.2.0
#
# The image is built first. When both a username and a token are supplied (via
# flag or environment), the script then logs in non-interactively using the
# token before pushing. Otherwise it assumes an existing session: run
# `docker login` first.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

# Log in to Docker Hub when credentials were supplied. The build happens before
# this, so an unauthenticated `docker build` never needs a session.
login_to_hub() {
  if [[ -z "$HUB_USER" ]]; then
    return 0
  fi

  # Log in against a throwaway config dir so the user's own docker config is
  # left untouched, and clean it up on the way out.
  DOCKER_CONFIG_DIR="$(mktemp -d)"
  export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
  trap 'rm -rf "$DOCKER_CONFIG_DIR"' EXIT

  echo "Logging in to Docker Hub as ${HUB_USER} ..."
  printf '%s' "$HUB_PAT" | docker login -u "$HUB_USER" --password-stdin
}

USER_ARG=""
TOKEN_ARG=""
TAG_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    -u | --user)
      if [[ $# -lt 2 ]]; then
        echo "error: $1 requires a value" >&2
        exit 1
      fi
      USER_ARG="$2"
      shift 2
      ;;
    --user=*)
      USER_ARG="${1#*=}"
      shift
      ;;
    --token)
      if [[ $# -lt 2 ]]; then
        echo "error: $1 requires a value" >&2
        exit 1
      fi
      TOKEN_ARG="$2"
      shift 2
      ;;
    --token=*)
      TOKEN_ARG="${1#*=}"
      shift
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$TAG_ARG" ]]; then
        echo "error: unexpected extra argument: $1" >&2
        exit 1
      fi
      TAG_ARG="$1"
      shift
      ;;
  esac
done

IMAGE="${IMAGE:-kaiwegner/ohrbob.testcasts}"
TAG="${TAG_ARG:-latest}"
REF="${IMAGE}:${TAG}"

HUB_USER="${USER_ARG:-${DOCKERHUB_USER:-}}"
HUB_PAT="${TOKEN_ARG:-${DOCKERHUB_PAT:-}}"

if [[ -z "$TAG" ]]; then
  echo "error: tag must not be empty" >&2
  exit 1
fi

if [[ -n "$HUB_USER" && -z "$HUB_PAT" ]]; then
  echo "error: a Docker Hub username was given but no token. Set DOCKERHUB_PAT or pass --token." >&2
  exit 1
fi

if [[ -z "$HUB_USER" && -n "$HUB_PAT" ]]; then
  echo "error: a Docker Hub token was given but no username. Set DOCKERHUB_USER or pass --user." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required but was not found" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "error: cannot talk to the Docker daemon. Is it running?" >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "Building ${REF} ..."
docker build -t "$REF" .

login_to_hub

echo "Pushing ${REF} ..."
docker push "$REF"
echo "Published ${REF}"
