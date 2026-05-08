#!/bin/sh
set -e

echo "▶ Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy \
  --schema=packages/database/prisma/schema.prisma

echo "▶ Starting Launchtic web..."
# Next.js standalone with outputFileTracingRoot pointing at the monorepo root
# emits the entry at apps/web/server.js (not the WORKDIR root).
exec node apps/web/server.js
