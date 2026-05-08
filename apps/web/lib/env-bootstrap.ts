// Derive URL env vars from the canonical 2 inputs (APP_DOMAIN + PAGES_DOMAIN).
// Idempotent — explicit values in .env always win over derived defaults.
//
// MUST be imported as a side-effect at the very top of:
//   - apps/web/next.config.ts (so Next bundles NEXT_PUBLIC_* at build time)
//   - apps/worker/src/index.ts (so workers reading APP_URL get the right value)
//
// The renderer doesn't need this — its only env-derived URL is WEB_API_URL,
// which points at the Docker internal hostname (not derivable from the public
// domain).

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
process.env.NEXT_PUBLIC_RENDERER_URL =
  process.env.NEXT_PUBLIC_RENDERER_URL || RENDERER_URL;
