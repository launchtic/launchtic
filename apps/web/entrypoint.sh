#!/bin/sh
set -e

echo "▶ Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy \
  --schema=packages/database/prisma/schema.prisma

echo "▶ Starting Launchtic web..."
exec node server.js
