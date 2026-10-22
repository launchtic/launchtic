// Locate packages/database/src/seed-data/ from runtime. The path differs:
//   - dev: pnpm dev runs from apps/web → cwd = .../apps/web → ../../packages/...
//   - Docker: entrypoint runs `node apps/web/server.js` from /app → cwd = /app
// Probe both candidates lazily so the first valid one is cached.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

let cachedDir: string | null = null;

function seedDir(): string {
  if (cachedDir) return cachedDir;
  const candidates = [
    resolve(process.cwd(), "packages/database/src/seed-data"),         // Docker / monorepo root cwd
    resolve(process.cwd(), "../../packages/database/src/seed-data"),   // apps/web cwd (dev)
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "templates"))) {
      cachedDir = c;
      return c;
    }
  }
  throw new Error(`seed-data directory not found. Tried:\n  ${candidates.join("\n  ")}`);
}

// Starter page templates shipped with the app, as .ltbundle files (same format
// as exports and add-ons, images embedded). Sorted so install order is stable.
export function loadSeedTemplateBundles(): { file: string; buf: Buffer }[] {
  const dir = join(seedDir(), "templates");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ltbundle"))
    .sort()
    .map((file) => ({ file, buf: readFileSync(join(dir, file)) }));
}
