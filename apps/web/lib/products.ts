// Purchased products (template packs…) live on the license server as sets of
// .ltbundle files. A product key lists them and downloads them; the instance
// then imports each bundle with importBundle — server to server, so the
// browser never moves the bytes.

export type ProductFile = { name: string; bytes: number };
export type ProductListing = { product: { sku: string; name: string }; files: ProductFile[] };

function serverUrl(): string {
  return process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";
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

export async function fetchProductFiles(key: string): Promise<ProductListing> {
  const res = await post("/api/products/files", { key }, 10_000);
  if (!res.ok) throw new Error(await errorOf(res));
  return res.json();
}

export async function downloadProductFile(key: string, file: string): Promise<Buffer> {
  const res = await post("/api/products/download", { key, file }, 120_000);
  if (!res.ok) throw new Error(await errorOf(res));
  return Buffer.from(await res.arrayBuffer());
}
