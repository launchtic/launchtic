#!/usr/bin/env node
// Toggle link mode cho @launchtic/elements bằng marker file.
// Marker (.elements-linked) gitignored — package.json không bao giờ bị sửa.
// .pnpmfile.cjs đọc marker khi pnpm install và inject link: override tại memory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MARKER = path.join(ROOT, ".elements-linked");
const NEXT_CACHES = ["apps/web/.next", "apps/renderer/.next"];

const cmd = process.argv[2];
if (cmd !== "link" && cmd !== "unlink") {
  console.error("Usage: node scripts/elements-link.mjs <link|unlink>");
  process.exit(1);
}

if (cmd === "link") {
  fs.writeFileSync(MARKER, "");
  console.log("Created .elements-linked (link mode active)");
} else {
  if (fs.existsSync(MARKER)) {
    fs.rmSync(MARKER);
    console.log("Removed .elements-linked (NPM mode active)");
  } else {
    console.log(".elements-linked không tồn tại — đã ở NPM mode");
  }
}

for (const p of NEXT_CACHES) {
  const abs = path.join(ROOT, p);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`Cleared ${p}`);
  }
}

console.log("Running pnpm install...");
execSync("pnpm install", { stdio: "inherit", cwd: ROOT });
