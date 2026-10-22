// GET  /api/branding   → current branding (resolved + raw + capability flag)
// PUT  /api/branding   → save branding patch (Owner-only + plan-gated)
// DELETE /api/branding → reset to launchtic defaults (Owner-only)
//
// Org-level resource. ALL operations require Organization owner (founder),
// not a permission. White-label is an identity-bound, billing-locked
// decision — admins shouldn't be able to override the founder's brand even
// with `settings:general:write`. Writes ALSO require AGENCY/CUSTOM plan.
//
// Reads are owner-only too for consistency (admins don't browse the
// branding config). If we want admins to PREVIEW the branding later, this
// can be relaxed — UI-only impact, no security delta.
//
// Business logic (plan gate + persistence) lives in @launchtic/ee — this
// route only handles auth/ownership + HTTP shape.

import { NextRequest } from "next/server";
import { z } from "zod";
import { getBranding, saveBranding, resetBranding } from "@launchtic/ee";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";
import { db, getPlanFeatures } from "@launchtic/database";

// Patch schema — every field optional, UI sends only what changed.
// URLs: returned from /api/media/upload OR pasted by the operator (CDN).
const patchSchema = z.object({
  brandName:    z.string().trim().max(60).optional(),
  logoUrl:      z.string().trim().max(500).optional(),
  logoLightUrl: z.string().trim().max(500).optional(),
  faviconUrl:   z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Only the Organization owner can view white-label config.", 403);
    const branding = await getBranding(r.organizationId);
    return ok(branding);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    // Block in demo — changing the shared instance's branding would persist
    // for every other visitor until the next reset.
    const blocked = demoGuard();
    if (blocked) return blocked;

    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Only the Organization owner can change white-label config.", 403);

    // Plan gate — AGENCY / CUSTOM only. We fetch plan via Organization here
    // rather than caching in requireAccess so a license downgrade takes
    // effect immediately (no need to re-login). Single read, cheap.
    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { plan: true },
    });
    if (!org) return err("Organization not found", 404);
    if (!getPlanFeatures(org.plan).whiteLabel) {
      return err(
        "White-label branding requires the Agency plan or higher. Upgrade in Settings → License & Updates.",
        402, // Payment Required — semantic match for plan-gate denials
      );
    }

    const patch = patchSchema.parse(await req.json());
    const saved = await saveBranding(r.organizationId, patch);
    return ok(saved);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;

    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Only the Organization owner can reset white-label config.", 403);
    // Reset is allowed regardless of plan — owner should always be able to
    // wipe their config (e.g. after downgrade) to fall back to defaults.
    await resetBranding(r.organizationId);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
