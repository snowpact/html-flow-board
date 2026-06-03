#!/bin/bash
set -e

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: v$CURRENT_VERSION"

if [ -z "$1" ]; then
  echo "Usage: npm run release -- <patch|minor|major>"
  echo "  patch: 0.2.0 → 0.2.1"
  echo "  minor: 0.2.0 → 0.3.0"
  echo "  major: 0.2.0 → 1.0.0"
  exit 1
fi

BUMP=$1

if [ "$(git status --porcelain)" ]; then
  echo "Error: working directory not clean. Commit or stash changes first."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main branch (currently on $BRANCH)"
  exit 1
fi

git pull --ff-only origin main

NEW_VERSION=$(node -p "
  var v = '$CURRENT_VERSION'.split('.').map(Number);
  if ('$BUMP' === 'major') { v[0]++; v[1]=0; v[2]=0; }
  else if ('$BUMP' === 'minor') { v[1]++; v[2]=0; }
  else if ('$BUMP' === 'patch') { v[2]++; }
  v.join('.');
")

echo "Bumping to v$NEW_VERSION"

node -e "
  var fs = require('fs');
  var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "Release v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main --tags

echo ""
echo "Done! v$NEW_VERSION pushed. GitHub Action will create the release."
