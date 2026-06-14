import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError, getUserId } from "../../../lib/api";
import { canCreateWorkspace } from "../../../lib/plan";
import { getOrganizationForOwner, getEffectivePlan } from "../../../lib/organization";
import { demoGuard } from "../../../lib/demo";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const userId = await getUserId();
    if (!userId) return err("Unauthorized", 401);

    const body = await req.json();
    const { name } = createSchema.parse(body);

    // The gate runs against the user's owned Organization — that org's plan
    // controls how many workspaces it can hold (Agency = unlimited). License
    // expiry is folded into the effective plan via getEffectivePlan.
    const organization = await getOrganizationForOwner(userId);
    if (!organization) return err("Organization not found", 404);

    const currentCount = await db.workspace.count({ where: { organizationId: organization.id } });
    const currentPlan  = getEffectivePlan(organization);

    if (!canCreateWorkspace(currentPlan, currentCount)) {
      return err("Upgrade to Pro to create additional workspaces.", 403);
    }

    const baseSlug = slugify(name) || "workspace";
    let slug = baseSlug;
    let attempt = 0;
    while (await db.workspace.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // No roles seeded, no WorkspaceMember row for the Owner — the Owner
    // bypasses permission checks via Organization.ownerId. They'll create
    // roles in Settings → Roles before inviting members.
    const workspace = await db.workspace.create({
      data: {
        name,
        slug,
        ownerId:        userId,
        organizationId: organization.id,
      },
    });

    return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug }, 201);
  } catch (error) {
    return handleError(error);
  }
}
