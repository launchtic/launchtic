// Caddy admin API client. Used by the first-run wizard (and any future
// domain-config UI) to switch Caddy from wizard-mode HTTP to production
// HTTPS without restarting the container.
//
// Endpoint: ${CADDY_ADMIN_URL}/load — accepts JSON config that replaces
// the entire running config. We build a Caddyfile string from a template,
// POST it to /adapt to get JSON, then POST that JSON to /load.
//
// Mirrors the original Caddyfile (uploads + reverse-proxy snippets, dual
// fixed-domain blocks, on-demand TLS for customer domains) but with the
// domain values + ACME email injected from SystemConfig.

const ADMIN = process.env.CADDY_ADMIN_URL ?? "http://caddy:2019";

export type CaddyDomainConfig = {
  appDomain:   string;
  pagesDomain: string;
  acmeEmail:   string;
};

/** Build the post-setup Caddyfile as a string. Mirrors the layout the
 *  project shipped with before the wizard rewrite. */
export function buildCaddyfile(cfg: CaddyDomainConfig): string {
  // Hot path — keep formatting close to the original Caddyfile for parity.
  return `{
\temail ${cfg.acmeEmail}
\tadmin :2019
\ton_demand_tls {
\t\task http://web:3000/api/domains/check
\t}
}

(proxy) {
\treverse_proxy {args[0]} {
\t\theader_up Host {host}
\t\theader_up X-Forwarded-Host {host}
\t\theader_down Location ":[0-9]+" ""
\t}
}

(uploads) {
\thandle_path /uploads/* {
\t\troot * /srv/uploads
\t\tfile_server
\t}
}

${cfg.appDomain} {
\timport uploads
\timport proxy web:3000
}

${cfg.pagesDomain} {
\timport uploads
\timport proxy renderer:3001
}

:443 {
\ttls {
\t\ton_demand
\t}
\timport uploads
\timport proxy renderer:3001
}

:80 {
\tredir https://{host}{uri} permanent
}
`;
}

/** Convert Caddyfile → JSON via Caddy's /adapt endpoint, then apply via
 *  /load. Caddy reloads in-place — no restart, no dropped connections.
 *
 *  Origin header is required: Node fetch (undici) automatically tags
 *  cross-origin requests with `Sec-Fetch-Mode: cors`, which makes Caddy's
 *  admin endpoint enforce the Origin header. Without us setting it, the
 *  header is empty and Caddy rejects with "origin '' not allowed". By
 *  passing `ADMIN` as the Origin (e.g. http://caddy:2019), it normalizes
 *  to //caddy:2019 which matches Caddy's auto-computed allowed origins. */
export async function reloadCaddy(cfg: CaddyDomainConfig): Promise<void> {
  const caddyfile = buildCaddyfile(cfg);
  const headers   = { "Origin": ADMIN };

  const adaptRes = await fetch(`${ADMIN}/adapt`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "text/caddyfile" },
    body:    caddyfile,
  });
  if (!adaptRes.ok) {
    const txt = await adaptRes.text().catch(() => "");
    throw new Error(`Caddy adapt failed (${adaptRes.status}): ${txt}`);
  }
  const adapted = await adaptRes.json() as { result?: unknown; warnings?: unknown[] };
  if (!adapted.result) throw new Error("Caddy adapt returned no result");

  const loadRes = await fetch(`${ADMIN}/load`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify(adapted.result),
  });
  if (!loadRes.ok) {
    const txt = await loadRes.text().catch(() => "");
    throw new Error(`Caddy load failed (${loadRes.status}): ${txt}`);
  }
}
