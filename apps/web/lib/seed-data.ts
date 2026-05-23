// Locate packages/database/src/seed-data/ from runtime. The path differs:
//   - dev: pnpm dev runs from apps/web → cwd = .../apps/web → ../../packages/...
//   - Docker: entrypoint runs `node apps/web/server.js` from /app → cwd = /app
// Probe both candidates lazily so the first valid one is cached.

import { existsSync, readFileSync, cpSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

let cachedDir: string | null = null;

function seedDir(): string {
  if (cachedDir) return cachedDir;
  const candidates = [
    resolve(process.cwd(), "packages/database/src/seed-data"),         // Docker / monorepo root cwd
    resolve(process.cwd(), "../../packages/database/src/seed-data"),   // apps/web cwd (dev)
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "page-templates.json"))) {
      cachedDir = c;
      return c;
    }
  }
  throw new Error(`seed-data directory not found. Tried:\n  ${candidates.join("\n  ")}`);
}

export type SeedPageTemplate = {
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  type: "OPTIN" | "SALES" | "CHECKOUT" | "UPSELL" | "DOWNSELL" | "THANKYOU" | "CUSTOM";
  tags: string[];
  pageJson: Record<string, unknown>;
  meta: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
};

// Read and parse the seed JSON. URLs inside contain `{{ASSET}}` placeholders
// that must be replaced with a workspace-scoped path before INSERT.
export function loadPageTemplatesSeed(): SeedPageTemplate[] {
  const raw = readFileSync(join(seedDir(), "page-templates.json"), "utf-8");
  return JSON.parse(raw);
}

// Replace `{{ASSET}}` placeholders in any nested string with the given prefix.
// Used to scope seed URLs to the freshly-created workspace's upload folder.
export function resolveAssetPlaceholders<T>(value: T, assetPrefix: string): T {
  const json = JSON.stringify(value);
  return JSON.parse(json.replaceAll("{{ASSET}}", assetPrefix)) as T;
}

// Copy seed-data/assets/* → public/uploads/{workspaceId}/
// Flat layout — all assets share the workspace root, no "seed" subfolder.
// Matches the LocalDriver layout in lib/storage.ts so files render via
// the existing /uploads/* static handler. S3 driver isn't configured at
// register time, so we only support local — user who switches to S3 later
// keeps the seed files on local disk (they still resolve via /uploads/).
export function copySeedAssetsToWorkspace(workspaceId: string): void {
  const src = join(seedDir(), "assets");
  if (!existsSync(src)) {
    console.warn("[seed-data] assets folder missing, skipping copy:", src);
    return;
  }
  const dest = resolve(process.cwd(), "apps/web/public/uploads", workspaceId);
  // Try alternate cwd if Docker layout (where public lives under apps/web)
  const destAlt = resolve(process.cwd(), "public/uploads", workspaceId);
  const target = existsSync(resolve(process.cwd(), "apps/web/public")) ? dest : destAlt;

  mkdirSync(target, { recursive: true });
  cpSync(src, target, { recursive: true });
}
