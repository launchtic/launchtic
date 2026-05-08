// Derive URL env vars from APP_DOMAIN + PAGES_DOMAIN. Mirror of
// apps/web/lib/env-bootstrap.ts (kept inline to avoid cross-package coupling).
// Imported at the top of apps/worker/src/index.ts so APP_URL is set before
// any module reads it (e.g. packages/email/src/unsubscribe.ts via the worker
// queues).

const isLocal = (host: string): boolean =>
  host.startsWith("localhost") || host.startsWith("127.");

const APP_DOMAIN = process.env.APP_DOMAIN ?? "localhost:3000";
const PAGES_DOMAIN = process.env.PAGES_DOMAIN ?? "localhost:3001";

const APP_URL = `${isLocal(APP_DOMAIN) ? "http" : "https"}://${APP_DOMAIN}`;
const RENDERER_URL = `${isLocal(PAGES_DOMAIN) ? "http" : "https"}://${PAGES_DOMAIN}`;

process.env.APP_URL = process.env.APP_URL || APP_URL;
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || APP_URL;
process.env.RENDERER_URL = process.env.RENDERER_URL || RENDERER_URL;
process.env.NEXT_PUBLIC_RENDERER_URL =
  process.env.NEXT_PUBLIC_RENDERER_URL || RENDERER_URL;
