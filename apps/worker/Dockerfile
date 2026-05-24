FROM node:20-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .pnpmfile.cjs ./
COPY packages/database/package.json packages/database/
COPY packages/database/prisma packages/database/prisma
COPY packages/email/package.json packages/email/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter=@launchtic/worker...

FROM base AS build
WORKDIR /app
RUN npm install -g esbuild
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/email/node_modules ./packages/email/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY . .
RUN pnpm --filter=@launchtic/database db:generate
RUN pnpm --filter=@launchtic/worker build
# Place the Prisma engine binary next to the bundle so Prisma finds it via __dirname
RUN find /app -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" \
    -path "*/.prisma/client/*" | head -1 | \
    xargs -I{} cp {} /app/apps/worker/dist/

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/apps/worker/dist/libquery_engine-linux-musl-openssl-3.0.x.so.node
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
