#!/bin/sh
set -e

# Derive APP_URL / NEXTAUTH_URL / RENDERER_URL from APP_DOMAIN / PAGES_DOMAIN.
# Mirrors lib/env-bootstrap.ts (which only runs at `next build` time — the
# Next.js standalone server.js does NOT re-execute next.config.ts at runtime,
# so we re-derive here before booting node). Idempotent: explicit values win.
case "$APP_DOMAIN" in
  localhost*|127.*) APP_PROTO=http ;;
  *)                APP_PROTO=https ;;
esac
case "$PAGES_DOMAIN" in
  localhost*|127.*) PAGES_PROTO=http ;;
  *)                PAGES_PROTO=https ;;
esac
export APP_URL="${APP_URL:-${APP_PROTO}://${APP_DOMAIN}}"
export NEXTAUTH_URL="${NEXTAUTH_URL:-${APP_URL}}"
export RENDERER_URL="${RENDERER_URL:-${PAGES_PROTO}://${PAGES_DOMAIN}}"

echo "▶ Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy \
  --schema=packages/database/prisma/schema.prisma

echo "▶ Starting Launchtic web (APP_URL=$APP_URL RENDERER_URL=$RENDERER_URL)..."
# Next.js standalone with outputFileTracingRoot pointing at the monorepo root
# emits the entry at apps/web/server.js (not the WORKDIR root).
exec node apps/web/server.js
