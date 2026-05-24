// Worker-side SystemConfig helper — mirrors apps/web/lib/system-config.ts
// so worker queues can build absolute URLs (unsubscribe links etc.) using
// the dashboard domain the operator picked in the first-run wizard.
//
// Cached per-process with TTL because workers process thousands of email
// sends per minute and we don't want a DB roundtrip per send.

import { db } from "@launchtic/database";

type Cached = {
  appUrl:      string;
  rendererUrl: string;
  stamp:       number;
};

let cache: Cached | null = null;
const TTL_MS = 60_000;

/** Dashboard URL for outgoing email links (unsubscribe, order receipts). */
export async function getAppUrl(): Promise<string> {
  return (await load()).appUrl;
}

/** Public funnel-pages URL. */
export async function getRendererUrl(): Promise<string> {
  return (await load()).rendererUrl;
}

async function load(): Promise<Cached> {
  const now = Date.now();
  if (cache && now - cache.stamp < TTL_MS) return cache;

  const row = await db.systemConfig.findUnique({ where: { id: "system" } });
  const appUrl      = row?.appDomain   ? `https://${row.appDomain}`   : (process.env.APP_URL      ?? "http://localhost:3000");
  const rendererUrl = row?.pagesDomain ? `https://${row.pagesDomain}` : (process.env.RENDERER_URL ?? "http://localhost:3001");

  cache = { appUrl, rendererUrl, stamp: now };
  return cache;
}
