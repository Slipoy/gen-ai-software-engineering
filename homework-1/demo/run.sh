#!/usr/bin/env bash
# Installs dependencies, builds the API and starts it with demo data preloaded.
# Usage: ./demo/run.sh            (seeded with demo/sample-data.json)
#        SEED_FILE= ./demo/run.sh (start with an empty store)
#        PORT=4000 ./demo/run.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building..."
npm run build

export PORT="${PORT:-3000}"
export SEED_FILE="${SEED_FILE-demo/sample-data.json}"

exec npm start
