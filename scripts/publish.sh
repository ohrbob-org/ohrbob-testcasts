#!/usr/bin/env bash
#
# Build and push the podcast-testcasts image to Docker Hub.
#
# Usage:
#   ./scripts/publish.sh [tag]
#
# Arguments:
#   tag   Image tag to publish (default: latest)
#
# Environment:
#   IMAGE      Image repository (default: kaiwegner/ohrbob.testcasts)
#   PLATFORMS  If set, do a multi-arch buildx build and push directly,
#              e.g. PLATFORMS=linux/amd64,linux/arm64
#
# Examples:
#   ./scripts/publish.sh
#   ./scripts/publish.sh 1.2.0
#   PLATFORMS=linux/amd64,linux/arm64 ./scripts/publish.sh 1.2.0
#
# Requires an authenticated session: run `docker login` first.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

IMAGE="${IMAGE:-kaiwegner/ohrbob.testcasts}"
TAG="${1:-latest}"
PLATFORMS="${PLATFORMS:-}"
REF="${IMAGE}:${TAG}"

if [[ -z "$TAG" ]]; then
  echo "error: tag must not be empty" >&2
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

if [[ -n "$PLATFORMS" ]]; then
  if ! docker buildx version >/dev/null 2>&1; then
    echo "error: PLATFORMS is set but docker buildx is not available" >&2
    exit 1
  fi

  echo "Building and pushing ${REF} for ${PLATFORMS} ..."
  docker buildx build --platform "$PLATFORMS" -t "$REF" --push .
  echo "Published ${REF} (${PLATFORMS})"
else
  echo "Building ${REF} ..."
  docker build -t "$REF" .

  echo "Pushing ${REF} ..."
  docker push "$REF"
  echo "Published ${REF}"
fi
