#!/usr/bin/env bash
set -euo pipefail

# Cut a release: bump version, tag, push, and create a GitHub Release.
# Pushing the tag fires .github/workflows/release.yml (jsDelivr cache purge).
# The pushed main commit redeploys GitHub Pages via the CI deploy job.
#
# Usage:
#   scripts/release.sh [patch|minor|major|<x.y.z>]   (default: patch)
#   npm run release -- minor

cd "$(dirname "$0")/.."
BUMP="${1:-patch}"

say() { printf '\033[1;34m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# --- Pre-flight ------------------------------------------------------------
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || die "Release from main (currently on '$branch')."
[ -z "$(git status --porcelain)" ] || die "Working tree is dirty — commit or stash first."

git fetch --quiet origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || die "Local main differs from origin/main — pull first."

# --- Quality gates ---------------------------------------------------------
say "typecheck"
npm run --silent typecheck
say "build"
npm run --silent build
[ -z "$(git status --porcelain -- flowboard.js flowboard.min.js)" ] \
  || die "Committed bundle is stale. Run 'npm run build' and commit before releasing."
say "tests"
npm test --silent

# --- Bump + tag (npm version commits 'Release vX.Y.Z' and tags vX.Y.Z) -----
say "bumping version ($BUMP)"
npm version "$BUMP" -m "Release v%s" >/dev/null
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

# --- Push commit + tag (the tag push triggers the jsDelivr purge) ----------
say "pushing $TAG"
git push --quiet origin main
git push --quiet origin "$TAG"

# --- GitHub Release (optional — nice auto-generated notes) ------------------
if command -v gh >/dev/null 2>&1; then
  gh release create "$TAG" --title "$TAG" --generate-notes >/dev/null 2>&1 \
    || env -u GH_TOKEN gh release create "$TAG" --title "$TAG" --generate-notes >/dev/null 2>&1 \
    || printf '\033[1;33m⚠ Tag pushed, but the GitHub Release could not be created — make it manually if you want notes.\033[0m\n'
fi

printf '\n\033[1;32m✓ Released %s\033[0m\n' "$TAG"
echo "  CDN (immutable): https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@$TAG/flowboard.min.js"
echo "  Pages will redeploy from the main push."
