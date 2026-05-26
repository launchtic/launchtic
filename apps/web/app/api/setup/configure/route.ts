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
  // Localhost / dev bypass — accepted only when NODE_ENV !== "production".
  // Skips DNS-quorum check + tolerates an unreachable Caddy admin API.
  skipDns:     z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Anti-replay: refuse if a previous run already wrote SystemConfig.
    const existing = await db.systemConfig.findUnique({ where: { id: "system" } });
    if (existing?.setupCompletedAt) {
      return err("Setup already completed. Use Settings → Domains to change later.", 409);
    }

    const { appDomain, pagesDomain, skipDns } = schema.parse(await req.json());
    if (appDomain === pagesDomain) {
      return err("appDomain and pagesDomain must differ.", 400);
    }

    // ACME contact email = founder's account email. We require a User to
    // exist (Step 1 created the founder); if missing, the wizard is being
    // called out of order. Operator can override later in Settings if a
    // separate ops mailbox is preferred for cert-expiry notifications.
    const founder = await db.user.findFirst({
      orderBy: { createdAt: "asc" },
      select:  { email: true },
    });
    if (!founder) return err("Founder account not found. Complete Step 1 first.", 400);
    const acmeEmail = founder.email;

    // skipDns flag is dev-only — refuse in production so a misconfigured
    // operator can't accidentally bypass the safety check.
    const devBypass = !!skipDns && process.env.NODE_ENV !== "production";

    // Reload Caddy. In dev bypass mode we treat an unreachable admin API
    // (e.g. running `pnpm dev` without docker compose) as non-fatal —
    // SystemConfig still gets persisted so dashboard navigation works.
    // In production, an unreachable Caddy IS fatal so the operator doesn't
    // end up in a wizard-completed-but-no-HTTPS state.
    try {
      await reloadCaddy({ appDomain, pagesDomain, acmeEmail });
    } catch (e: any) {
      if (!devBypass) {
        return err(`Caddy reload failed: ${e?.message ?? "unknown"}`, 502);
      }
      console.warn("[setup] Caddy unreachable, continuing (dev bypass):", e?.message);
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
    // In dev bypass mode we redirect back to the same origin (e.g.
    // http://localhost:3000) instead of the configured domain, because the
    // dev server doesn't actually serve traffic on that domain.
    const appUrl = devBypass
      ? new URL(req.url).origin
      : `https://${appDomain}`;
    const res = NextResponse.json({ success: true, data: { appUrl } });
    res.cookies.set("lt_setup_done", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure:   !devBypass,  // dev runs on plain HTTP — secure cookies would be dropped
      path:     "/",
      maxAge:   60 * 60 * 24 * 365,
    });
    // Clear any stale NextAuth session left over from prior test runs.
    // Without this, a dev who re-ran the wizard against a fresh DB would
    // log in via cookie → land on /dashboard → 404 because the old user.id
    // no longer matches any workspace. Force a fresh login on the founder
    // account the wizard just created.
    for (const name of [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "authjs.session-token",
      "__Secure-authjs.session-token",
    ]) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }

    // Trigger container restart so entrypoint.sh re-reads SystemConfig and
    // exports the now-set AUTH_URL — fixes the NextAuth Docker signOut bug
    // (https://github.com/nextauthjs/next-auth/discussions/8449). Without
    // this, the new domain works for browsing but logout redirects to
    // https://0.0.0.0:3000/login until the operator manually restarts web.
    //
    // 1.5s delay gives this response time to reach the client before the
    // process dies. Docker's restart_policy: unless-stopped brings the
    // container back in ~5s; the wizard frontend polls the new domain's
    // /api/health and reloads when healthy.
    //
    // Skipped in dev (devBypass = pnpm dev): killing the dev server isn't
    // desirable and there's no Docker to restart it.
    if (!devBypass) {
      setTimeout(() => {
        console.log("[setup] Wizard complete — exiting to restart with AUTH_URL set");
        process.exit(0);
      }, 1500);
    }

    return res;
  } catch (error) {
    return handleError(error);
  }
}
