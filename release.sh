#!/bin/bash
set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Vérifier qu'on est sur main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo -e "${RED}Error: Must be on main branch${NC}"
  exit 1
fi

# Vérifier pas de changements non commités
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: Working directory not clean${NC}"
  exit 1
fi

# Vérifier que les fichiers publiés existent
for f in flowboard.js flowboard.css README.md LICENSE; do
  if [ ! -f "$f" ]; then
    echo -e "${RED}Error: Missing file: ${f}${NC}"
    exit 1
  fi
done

# Type de release (patch par défaut)
RELEASE_TYPE=${1:-patch}

if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid release type. Use: patch, minor, or major${NC}"
  exit 1
fi

# Version actuelle
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: v${CURRENT_VERSION}${NC}"
echo -e "${YELLOW}Starting release (${RELEASE_TYPE})...${NC}"

# Bump version
npm version $RELEASE_TYPE --no-git-tag-version

# Nouvelle version
VERSION=$(node -p "require('./package.json').version")

# Mettre à jour les URLs versionnées dans README.md
echo -e "${YELLOW}Updating README.md version references...${NC}"
sed -i '' "s/html-flow-board@[0-9]*\.[0-9]*\.[0-9]*/html-flow-board@${VERSION}/g" README.md
sed -i '' "s/html-flow-board@v[0-9]*\.[0-9]*\.[0-9]*/html-flow-board@v${VERSION}/g" README.md

# Commit et tag
git add package.json README.md
git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}"

# Push
echo -e "${YELLOW}Pushing to remote...${NC}"
git push origin main
git push origin "v${VERSION}"

# Publish
echo -e "${YELLOW}Publishing to npm...${NC}"
npm publish --access public

echo -e "${GREEN}Successfully released v${VERSION}${NC}"
echo -e "${GREEN}  npm: https://www.npmjs.com/package/html-flow-board${NC}"
echo -e "${GREEN}  cdn: https://cdn.jsdelivr.net/npm/html-flow-board@${VERSION}/flowboard.js${NC}"
