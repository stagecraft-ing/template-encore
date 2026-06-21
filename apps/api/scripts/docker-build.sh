#!/usr/bin/env bash
#
# OPTIONAL fast "cancel-then-scrape" Docker build — hotfix path only.
#
# The SUPPORTED build is `npm run build:docker`
# (encore build docker --config infra.config.json --base <base> <tag>).
# Use THIS script only when the supported builder's gzip layer step is
# pathologically slow and you need a source-only hotfix against an existing
# image shape. It reaches into Encore internals (paths may move between CLI
# versions) — see docs/encore-ts/encore-custom-dockerfile.md for the full
# rationale, trade-offs, and pitfalls.
#
# Run from apps/api/:  ./scripts/docker-build.sh [image-tag]
set -euo pipefail

IMAGE_TAG="${1:-template-api:hotfix}"
SCRATCH_TAG="encore-scratch:_"
MAIN_MJS=".encore/build/combined/combined/main.mjs"

echo "==> Step 1: compile main.mjs (cancel before the slow gzip step)"
docker image rm "$SCRATCH_TAG" >/dev/null 2>&1 || true
encore build docker --config ./infra.config.json "$SCRATCH_TAG" &
ENCORE_PID=$!
while [[ ! -f "$MAIN_MJS" ]]; do
  sleep 1
  kill -0 "$ENCORE_PID" 2>/dev/null || { echo "encore exited before main.mjs appeared"; exit 1; }
done
kill "$ENCORE_PID" 2>/dev/null || true
wait "$ENCORE_PID" 2>/dev/null || true
test -f "$MAIN_MJS" || { echo "main.mjs not found at $MAIN_MJS"; exit 1; }
echo "    main.mjs ready"

echo "==> Step 2: locate the native runtime for linux/amd64"
ENCORE_VERSION="$(encore version 2>&1 | awk '/^encore version/ {print $3}')"
case "$(uname -s)" in
  Darwin) CACHE_ROOT="$HOME/Library/Caches/encore/cache/bin" ;;
  *)      CACHE_ROOT="$HOME/.cache/encore/bin" ;;
esac
RUNTIME_SRC="${CACHE_ROOT}/${ENCORE_VERSION}/linux/amd64/encore-runtime.node"
if [[ ! -f "$RUNTIME_SRC" ]]; then
  echo "runtime missing for ${ENCORE_VERSION} linux/amd64"
  echo "hint: run 'encore build docker --os linux --arch amd64 scratch:_' once to populate the cache"
  exit 1
fi
cp "$RUNTIME_SRC" ./encore-runtime.node
echo "    copied encore-runtime.node (${ENCORE_VERSION})"

echo "==> Step 3: docker build $IMAGE_TAG"
docker build -f Dockerfile.hotfix -t "$IMAGE_TAG" .
echo "==> Done: $IMAGE_TAG"
echo "    run with:  docker run --rm -p 4000:4000 --env-file .env $IMAGE_TAG"
