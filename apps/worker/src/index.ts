// Worker entry point. Boots all queue workers and handles graceful shutdown.
//
// Modes (controlled by env WORKER_MODE):
//   standalone (default) — boot workers + idle loop. Used by Docker service.
//   embedded             — boot workers but caller manages lifecycle.
//   disabled             — no-op. Used when web disables embedded worker.

// ─── Env bootstrap (must run BEFORE any other import that reads APP_URL) ────
// Derive URL env vars from the canonical APP_DOMAIN + PAGES_DOMAIN inputs so
// outgoing email unsubscribe links use the correct host. Inlined here (rather
// than a separate file) to keep the compiled output as a single CJS-safe
// entry — separate ESM imports without `.js` extensions break Node's module
// resolver. Idempotent: explicit env values always win.
(() => {
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
})();

import { createEmailWorker } from "./queues/email";
import { createBroadcastWorker } from "./queues/broadcast";
import { createAutomationWorker } from "./queues/automation";
import { createSequenceWorker, ensureSequenceTickScheduled } from "./queues/sequence";
import type { Worker } from "bullmq";

const mode = process.env.WORKER_MODE ?? "standalone";

export function bootWorkers(): Worker[] {
  if (mode === "disabled") {
    console.log("[worker] disabled — exiting bootWorkers()");
    return [];
  }
  console.log(`[worker] booting (mode=${mode})`);
  // Schedule the sequence tick (singleton repeatable job). Fire-and-forget;
  // the function self-heals via BullMQ dedup if called multiple times.
  ensureSequenceTickScheduled().catch((e) =>
    console.error("[sequence] failed to schedule tick:", e),
  );
  return [
    createEmailWorker(),
    createBroadcastWorker(),
    createAutomationWorker(),
    createSequenceWorker(),
  ];
}

async function shutdown(workers: Worker[], signal: string) {
  console.log(`[worker] received ${signal}, shutting down...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

if (mode === "standalone") {
  const workers = bootWorkers();
  process.on("SIGTERM", () => shutdown(workers, "SIGTERM"));
  process.on("SIGINT", () => shutdown(workers, "SIGINT"));
}
