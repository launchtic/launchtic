// POST /api/billing/portal — open Stripe Customer Portal for the install's
// Organization. Owner-only.
//
// Flow:
//   1. Read Organization.licenseKey
//   2. Forward to launchtic.com /api/portal with licenseKey + returnUrl
//   3. Return the portal URL — client opens it (window.location.href = url)
//
// We proxy server-side instead of letting the client call launchtic.com
// directly so:
//   (a) licenseKey never leaves the install (client never sees it)
//   (b) returnUrl is computed from request origin (correct across deploys)
//   (c) one place to add retries / caching later

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const org = await db.organization.findUnique({
      where:  { id: r.organizationId },
      select: { licenseKey: true, plan: true },
    });
    if (!org) return err("Organization not found", 404);
    if (!org.licenseKey || org.plan === "COMMUNITY") {
      return err("No active subscription to manage. Activate a license first.", 400);
    }

    // After portal close, Stripe redirects back here. Send the operator
    // straight to the License page so they can re-verify if needed.
    // apiFetch sets x-workspace-slug from current URL — see lib/api-client.
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    const slug   = req.headers.get("x-workspace-slug");
    const finalReturnUrl = slug
      ? `${origin}/${slug}/settings/license`
      : `${origin}/dashboard`;

    const serverUrl = process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";
    const upstream = await fetch(`${serverUrl}/api/portal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ licenseKey: org.licenseKey, returnUrl: finalReturnUrl }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      // Pass through upstream error message — most useful one is "portal
      // not enabled" (operator's problem to escalate to launchtic support).
      return err(data?.error ?? "Could not open billing portal", upstream.status);
    }
    if (typeof data?.url !== "string") {
      return err("Invalid response from billing server", 502);
    }

    return ok({ url: data.url });
  } catch (error) {
    return handleError(error);
  }
}
