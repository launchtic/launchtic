// Purchased products (template packs…) live on the license server as sets of
// .ltbundle files. A product key lists them and downloads them; the instance
// then imports each bundle with importBundle — server to server, so the
// browser never moves the bytes.
//
// A key is bound to the server (Organization.instanceId) of its first install
// and each file installs once per key, into whichever workspace ran it — other
// workspaces get the templates by cloning. The license server tracks installed
// files, so files added to the product later show up as new.

import { db } from "@launchtic/database";
import { instanceIdOf } from "./license";

export type ProductFile = { name: string; bytes: number };
export type ProductListing = {
  product: { sku: string; name: string };
  files: ProductFile[];
  installed: string[];
  activated: boolean;
};

function serverUrl(): string {
  return process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";
}

// Same id plan-license verification uses: the server's LAUNCHTIC_INSTANCE_ID
// when set (stable across reinstalls), else one stored on the Organization —
// created on first need so installs without the env var get one too.
export async function instanceIdFor(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { instanceId: true } });
  let instanceId = instanceIdOf(org?.instanceId);
  if (!instanceId) {
    instanceId = crypto.randomUUID();
    await db.organization.update({ where: { id: organizationId }, data: { instanceId } });
  }
  return instanceId;
}

async function post(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(`${serverUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? `License server error (${res.status})`;
}

export async function fetchProductFiles(key: string, instanceId: string): Promise<ProductListing> {
  const res = await post("/api/products/files", { key, instanceId }, 10_000);
  if (!res.ok) throw new Error(await errorOf(res));
  return res.json();
}

export async function downloadProductFile(key: string, file: string, instanceId: string): Promise<Buffer> {
  const res = await post("/api/products/download", { key, file, instanceId }, 120_000);
  if (!res.ok) throw new Error(await errorOf(res));
  return Buffer.from(await res.arrayBuffer());
}

export async function markInstalled(key: string, file: string, instanceId: string): Promise<void> {
  const res = await post("/api/products/installed", { key, file, instanceId }, 10_000);
  if (!res.ok) throw new Error(await errorOf(res));
}
