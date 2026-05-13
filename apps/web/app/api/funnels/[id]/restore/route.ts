import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { assertAllStepSlugsAvailable } from "../../../../../lib/funnels/slug-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/funnels/:id/restore — restore a TRASHED funnel back to ACTIVE.
// While the funnel was trashed, another funnel may have claimed one of its
// slugs. Re-validate every step before restoring so the user knows up-front
// instead of finding broken URLs.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const funnel = await db.funnel.findUnique({
      where: { id, workspaceId },
      include: {
        domains: { select: { domain: { select: { id: true, isDefault: true } } } },
      },
    });
    if (!funnel) return err("Funnel not found", 404);
    if (funnel.status !== "TRASHED") {
      return err("Funnel is not in trash.", 409);
    }

    // Compute the URL space the funnel will live in once restored — same
    // FunnelDomain entries it had before trashing.
    const customDomainIds = funnel.domains
      .filter((d) => !d.domain.isDefault)
      .map((d) => d.domain.id);

    // Throws SlugConflictError → 409 if any slug is already taken.
    await assertAllStepSlugsAvailable(workspaceId, id, customDomainIds);

    const updated = await db.funnel.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
