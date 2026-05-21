import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError, getUserId } from "../../../lib/api";
import { canCreateWorkspace } from "@launchtic/ee";
import { getOrganizationForOwner, getEffectivePlan } from "../../../lib/organization";
import { seedDefaultRoles, findAdminRoleId } from "../../../lib/seed-roles";

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

    // Create workspace + seed default roles + seat creator as Admin in one tx
    // so partial failure rolls back cleanly. The creator is the Org owner (in
    // B-minimal) and bypasses permissions anyway — Admin is the natural FK
    // default since roleId is NOT NULL.
    const workspace = await db.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name,
          slug,
          ownerId:        userId,
          organizationId: organization.id,
        },
      });

      const roles       = await seedDefaultRoles(tx, ws.id);
      const adminRoleId = findAdminRoleId(roles);

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          roleId:      adminRoleId,
        },
      });

      return ws;
    });

    return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug }, 201);
  } catch (error) {
    return handleError(error);
  }
}
