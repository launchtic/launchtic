// Worker entry point. Boots all queue workers and handles graceful shutdown.
//
// Modes (controlled by env WORKER_MODE):
//   standalone (default) — boot workers + idle loop. Used by Docker service.
//   embedded             — boot workers but caller manages lifecycle.
//   disabled             — no-op. Used when web disables embedded worker.

// MUST be the first import — derives APP_URL etc. from APP_DOMAIN before any
// queue module reads them (unsubscribe URLs in outgoing emails).
import "./env-bootstrap";

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
