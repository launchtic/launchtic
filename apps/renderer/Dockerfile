FROM node:20-alpine AS base
RUN corepack enable

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/database/package.json packages/database/
COPY packages/database/prisma packages/database/prisma
COPY packages/types/package.json packages/types/
COPY packages/elements/package.json packages/elements/
COPY apps/renderer/package.json apps/renderer/
RUN pnpm install --frozen-lockfile --filter=@launchtic/renderer...

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app .
COPY . .
RUN npx --yes prisma@6.7.0 generate --schema=packages/database/prisma/schema.prisma
RUN pnpm --filter=@launchtic/renderer build
# Copy Prisma query engine binary into standalone bundle (same reason as web Dockerfile).
RUN find /app/node_modules/.pnpm -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" \
    -path "*/.prisma/client/*" | head -1 | \
    xargs -I{} cp {} /app/apps/renderer/.next/standalone/apps/renderer/.next/server/

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/renderer/.next/standalone ./
COPY --from=builder /app/apps/renderer/.next/static ./apps/renderer/.next/static
COPY --from=builder /app/apps/renderer/public ./apps/renderer/public

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"
# Next.js standalone with outputFileTracingRoot pointing at the monorepo root
# emits the entry at apps/renderer/server.js (not the WORKDIR root).
CMD ["node", "apps/renderer/server.js"]
