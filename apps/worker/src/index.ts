// Worker entry point. Boots all queue workers and handles graceful shutdown.
//
// Modes (controlled by env WORKER_MODE):
//   standalone (default) — boot workers + idle loop. Used by Docker service.
//   embedded             — boot workers but caller manages lifecycle.
//   disabled             — no-op. Used when web disables embedded worker.
//
// APP_URL / RENDERER_URL are read directly from process.env at runtime — set
// them in the deployment env (docker-compose.yml passes them through from .env).

import { createEmailWorker } from "./queues/email";
import { createBroadcastWorker } from "./queues/broadcast";
import { createWorkflowWorker } from "./queues/workflow";
import type { Worker } from "bullmq";

const mode = process.env.WORKER_MODE ?? "standalone";

export function bootWorkers(): Worker[] {
  if (mode === "disabled") {
    console.log("[worker] disabled — exiting bootWorkers()");
    return [];
  }
  console.log(`[worker] booting (mode=${mode})`);
  return [
    createEmailWorker(),
    createBroadcastWorker(),
    createWorkflowWorker(),
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
