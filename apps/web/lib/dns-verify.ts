// DNS verification used by the first-run wizard before triggering Let's
// Encrypt cert issuance. Queries multiple public resolvers in parallel and
// reports per-resolver status — DNS propagation lag means a single resolver
// can return stale data even when other resolvers show the new A record.

import { Resolver } from "node:dns/promises";

export type ResolverCheck = {
  name:     string;  // human-readable resolver label
  ip:       string;  // resolver address
  resolved: string[] | null;  // A records found, or null on error/timeout
  matches:  boolean;          // true if resolved includes expectedIp
  error?:   string;
};

const RESOLVERS: { name: string; ip: string }[] = [
  { name: "Cloudflare", ip: "1.1.1.1" },
  { name: "Google",     ip: "8.8.8.8" },
  { name: "Quad9",      ip: "9.9.9.9" },
];

const QUERY_TIMEOUT_MS = 3500;

/** Resolve `hostname` against every configured public resolver. Returns one
 *  entry per resolver — caller can show partial progress (some checks
 *  succeeded, others still propagating). */
export async function checkDomainAcrossResolvers(
  hostname: string,
  expectedIp: string,
): Promise<ResolverCheck[]> {
  return Promise.all(RESOLVERS.map(async (r) => {
    const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
    resolver.setServers([r.ip]);
    try {
      const records = await resolver.resolve4(hostname);
      return {
        name:     r.name,
        ip:       r.ip,
        resolved: records,
        matches:  records.includes(expectedIp),
      };
    } catch (e: any) {
      return {
        name:     r.name,
        ip:       r.ip,
        resolved: null,
        matches:  false,
        error:    e?.code === "ETIMEOUT" ? "Timeout" : (e?.code ?? "DNS error"),
      };
    }
  }));
}

/** Quorum check — at least N resolvers must report the expected IP. */
export function quorumReached(checks: ResolverCheck[], minMatches = 2): boolean {
  return checks.filter((c) => c.matches).length >= minMatches;
}
