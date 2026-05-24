// First-run wizard — DNS pre-flight before triggering Let's Encrypt.
//
// Queries 3 public resolvers (Cloudflare/Google/Quad9) in parallel and
// reports per-resolver state. The UI shows live progress (Cloudflare ✓,
// Google ⏳, Quad9 ✓) and unblocks once quorum (2+) agrees on the IP.
// Hitting Let's Encrypt before DNS propagates risks burning the 5-cert
// per-domain-per-week rate limit.

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { checkDomainAcrossResolvers, quorumReached } from "../../../../lib/dns-verify";

const schema = z.object({
  appDomain:   z.string().min(1),
  pagesDomain: z.string().min(1),
  serverIp:    z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { appDomain, pagesDomain, serverIp } = schema.parse(await req.json());

    const [appChecks, pagesChecks] = await Promise.all([
      checkDomainAcrossResolvers(appDomain,   serverIp),
      checkDomainAcrossResolvers(pagesDomain, serverIp),
    ]);

    return ok({
      app:   { domain: appDomain,   checks: appChecks,   ready: quorumReached(appChecks)   },
      pages: { domain: pagesDomain, checks: pagesChecks, ready: quorumReached(pagesChecks) },
    });
  } catch (error) {
    return handleError(error);
  }
}
