import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError, getUserId } from "../../../lib/api";
import { canCreateWorkspace } from "@launchtic/ee";

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

    const [user, currentCount] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { plan: true, licenseKey: true, licenseExpiresAt: true } }),
      db.workspace.count({ where: { ownerId: userId } }),
    ]);

    const isExpired = user?.licenseExpiresAt != null && user.licenseExpiresAt < new Date();
    const hasLicense = user?.licenseKey != null && !isExpired;
    const currentPlan = hasLicense ? (user?.plan ?? "FREE") : "FREE";

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

    const workspace = await db.workspace.create({
      data: {
        name,
        slug,
        ownerId: userId,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });

    return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug }, 201);
  } catch (error) {
    return handleError(error);
  }
}
