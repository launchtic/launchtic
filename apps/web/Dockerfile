FROM node:20-alpine AS base
RUN corepack enable

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/database/package.json packages/database/
COPY packages/email/package.json packages/email/
COPY packages/ui/package.json packages/ui/
COPY packages/elements/package.json packages/elements/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter=@launchtic/web...

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
# Copy installed node_modules from deps stage, then overlay source files
COPY --from=deps /app .
COPY . .
RUN npx --yes prisma@6.7.0 generate --schema=packages/database/prisma/schema.prisma
RUN pnpm --filter=@launchtic/web build

# ─── Stage 3: Prisma CLI for migrations ──────────────────────────────────────
# Installed separately to get the correct platform binary (musl/alpine)
FROM node:20-alpine AS prisma-cli
WORKDIR /prisma
RUN npm install prisma@6.7.0 --save-exact

# ─── Stage 4: Production runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma CLI + engines for running migrations at startup
COPY --from=prisma-cli /prisma/node_modules/prisma ./node_modules/prisma
COPY --from=prisma-cli /prisma/node_modules/@prisma ./node_modules/@prisma

# Migration schema
COPY packages/database/prisma ./packages/database/prisma

# Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

COPY apps/web/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["/entrypoint.sh"]
