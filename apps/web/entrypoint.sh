#!/bin/sh
set -e

echo "▶ Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy \
  --schema=packages/database/prisma/schema.prisma

# ─── Bootstrap AUTH_URL from SystemConfig ────────────────────────────────────
# NextAuth v5 in Next.js Docker standalone has a bug: signOut redirect uses
# HOSTNAME (=0.0.0.0) + PORT (=3000) instead of the public domain from the
# Host header, so logout sends users to https://0.0.0.0:3000/login. Setting
# AUTH_URL explicitly overrides this.
# See https://github.com/nextauthjs/next-auth/discussions/8449
#
# Wizard not run yet → SystemConfig empty → AUTH_URL stays unset → wizard
# mode (NextAuth falls back to request headers, OK for HTTP wizard flow).
#
# Wizard completes → configure endpoint exits process 0 → Docker restarts
# container per restart_policy → this script runs again, finds appDomain in
# SystemConfig, exports AUTH_URL with the right value.
APP_DOMAIN=$(psql "$DATABASE_URL" -tAc \
  "SELECT \"appDomain\" FROM \"SystemConfig\" WHERE id='system' LIMIT 1" 2>/dev/null \
  | tr -d '[:space:]' || true)

if [ -n "$APP_DOMAIN" ]; then
  export AUTH_URL="https://${APP_DOMAIN}"
  echo "▶ AUTH_URL = ${AUTH_URL} (from SystemConfig)"
else
  echo "▶ AUTH_URL unset — wizard not run yet"
fi

echo "▶ Starting Launchtic web..."
# Next.js standalone with outputFileTracingRoot pointing at the monorepo root
# emits the entry at apps/web/server.js (not the WORKDIR root).
exec node apps/web/server.js
