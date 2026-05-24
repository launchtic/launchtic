// First-run wizard — Step 2 commit: persist domain config + flip Caddy to
// production HTTPS.
//
// Sequence:
//   1. Validate input (domains + email well-formed)
//   2. Refuse if SystemConfig already marks setup done (anti-replay)
//   3. Upsert SystemConfig row with the new domains
//   4. POST the production Caddyfile to Caddy admin API → hot reload
//   5. Stamp setupCompletedAt and set the wizard cookie
//
// Returns the new HTTPS app URL so the client can redirect there. Cert
// issuance is async (Caddy starts the ACME challenge after reload); the
// client polls /api/health on the new domain until it succeeds.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { invalidateSystemConfigCache } from "../../../../lib/system-config";
import { reloadCaddy } from "../../../../lib/caddy-admin";

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$/;

const schema = z.object({
  appDomain:   z.string().regex(DOMAIN_RE, "Invalid domain format"),
  pagesDomain: z.string().regex(DOMAIN_RE, "Invalid domain format"),
  acmeEmail:   z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    // Anti-replay: refuse if a previous run already wrote SystemConfig.
    const existing = await db.systemConfig.findUnique({ where: { id: "system" } });
    if (existing?.setupCompletedAt) {
      return err("Setup already completed. Use Settings → Domains to change later.", 409);
    }

    const { appDomain, pagesDomain, acmeEmail } = schema.parse(await req.json());
    if (appDomain === pagesDomain) {
      return err("appDomain and pagesDomain must differ.", 400);
    }

    // Reload Caddy FIRST. If the admin API isn't reachable we want to fail
    // loud BEFORE we mark setup complete, so the user can retry without
    // ending up in a wizard-completed-but-no-HTTPS state.
    try {
      await reloadCaddy({ appDomain, pagesDomain, acmeEmail });
    } catch (e: any) {
      return err(`Caddy reload failed: ${e?.message ?? "unknown"}`, 502);
    }

    // Persist config + mark complete. upsert so a partial earlier attempt
    // (cookie cleared mid-flow) heals on retry.
    await db.systemConfig.upsert({
      where:  { id: "system" },
      update: { appDomain, pagesDomain, acmeEmail, setupCompletedAt: new Date() },
      create: { id: "system", appDomain, pagesDomain, acmeEmail, setupCompletedAt: new Date() },
    });
    invalidateSystemConfigCache();

    // Set the wizard cookie used by middleware to skip the /setup redirect
    // on subsequent requests. httpOnly so client JS can't tamper. 1y maxAge.
    const res = NextResponse.json({ success: true, data: { appUrl: `https://${appDomain}` } });
    res.cookies.set("lt_setup_done", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure:   true,
      path:     "/",
      maxAge:   60 * 60 * 24 * 365,
    });
    return res;
  } catch (error) {
    return handleError(error);
  }
}
