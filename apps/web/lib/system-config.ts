// Instance-wide config (domains, ACME email) lives in the SystemConfig
// singleton row. Wizard writes here on first-run; apps read here to build
// public URLs without depending on env vars that were set at container boot.
//
// Cached per-process — the row only changes when an operator re-runs the
// wizard (rare). Cache lives until process restart.

import { db } from "@launchtic/database";

export type SystemConfigData = {
  appDomain:        string | null;
  pagesDomain:      string | null;
  acmeEmail:        string | null;
  setupCompletedAt: Date | null;
};

let cached: SystemConfigData | null = null;
let cacheStamp = 0;
const TTL_MS = 60_000;

export async function getSystemConfig(force = false): Promise<SystemConfigData> {
  const now = Date.now();
  if (!force && cached && now - cacheStamp < TTL_MS) return cached;

  const row = await db.systemConfig.findUnique({ where: { id: "system" } });
  cached = {
    appDomain:        row?.appDomain        ?? null,
    pagesDomain:      row?.pagesDomain      ?? null,
    acmeEmail:        row?.acmeEmail        ?? null,
    setupCompletedAt: row?.setupCompletedAt ?? null,
  };
  cacheStamp = now;
  return cached;
}

export function invalidateSystemConfigCache() {
  cached = null;
  cacheStamp = 0;
}

/** Has the first-run wizard finished? Cheap synchronous-ish check that
 *  uses the cache when warm. Misses cache only on first call per process. */
export async function isSetupComplete(): Promise<boolean> {
  const cfg = await getSystemConfig();
  return cfg.setupCompletedAt != null;
}

/** Public dashboard URL — used in outgoing emails, redirects, etc. Falls
 *  back to env var (for legacy installs that haven't run the wizard yet),
 *  then localhost (dev). */
export async function getAppUrl(): Promise<string> {
  const cfg = await getSystemConfig();
  if (cfg.appDomain) return `https://${cfg.appDomain}`;
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Public pages URL — used to build funnel-step preview links + custom
 *  domain CNAME hints. */
export async function getRendererUrl(): Promise<string> {
  const cfg = await getSystemConfig();
  if (cfg.pagesDomain) return `https://${cfg.pagesDomain}`;
  return process.env.RENDERER_URL ?? "http://localhost:3001";
}

/** Just the bare domain — used by the custom-domain validator that compares
 *  against the default pages domain. */
export async function getPagesDomain(): Promise<string> {
  const cfg = await getSystemConfig();
  return cfg.pagesDomain ?? process.env.PAGES_DOMAIN ?? "";
}
