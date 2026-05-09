// Derive URL env vars from the canonical 2 inputs (APP_DOMAIN + PAGES_DOMAIN).
// Idempotent — explicit values in .env always win over derived defaults.
//
// Imported as a side-effect at the top of next.config.ts so build-time tooling
// (e.g. experimental.serverActions.allowedOrigins) sees derived values during
// `next build`. It does NOT run at server *runtime* — Next.js standalone mode
// pre-bakes config into server.js and never re-loads next.config.ts. Runtime
// derivation lives in apps/web/entrypoint.sh (mirror this file's logic in
// shell). The worker re-derives inline in apps/worker/src/index.ts.
//
// All values are read at runtime by server code (server components, API
// routes, worker). They are NOT bundled into the client — client components
// receive the URL as a prop from their server parent. This keeps the same
// Docker image portable across deployments with different domains.

const isLocal = (host: string): boolean =>
  host.startsWith("localhost") || host.startsWith("127.");

const APP_DOMAIN = process.env.APP_DOMAIN ?? "localhost:3000";
const PAGES_DOMAIN = process.env.PAGES_DOMAIN ?? "localhost:3001";

const APP_URL = `${isLocal(APP_DOMAIN) ? "http" : "https"}://${APP_DOMAIN}`;
const RENDERER_URL = `${isLocal(PAGES_DOMAIN) ? "http" : "https"}://${PAGES_DOMAIN}`;

// `process.env.X || default` preserves explicit overrides — only fills empty.
process.env.APP_URL = process.env.APP_URL || APP_URL;
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || APP_URL;
process.env.RENDERER_URL = process.env.RENDERER_URL || RENDERER_URL;
