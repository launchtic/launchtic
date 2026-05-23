import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import {
  loadPageTemplatesSeed,
  resolveAssetPlaceholders,
  copySeedAssetsToWorkspace,
} from "../../../../lib/seed-data";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  workspaceName: z.string().min(1).max(100),
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
    // Single-tenant lockout — once any user exists, this endpoint is closed.
    // The /register UI hides itself the same way (server-component redirect),
    // but defense-in-depth here closes the direct-POST path too.
    const userCount = await db.user.count();
    if (userCount > 0) return err("This install is already configured. Sign in instead.", 409);

    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) return err("Email already in use.", 409);

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Generate unique workspace slug
    const baseSlug = slugify(data.workspaceName) || "workspace";
    let slug = baseSlug;
    let attempt = 0;
    while (await db.workspace.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const { user, workspaceId } = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
        },
      });

      // Auto-create the founder's Organization. On self-host this is the only
      // Organization that will ever exist on this instance (register endpoint
      // locks down after the first signup). Organization holds plan/license;
      // every Workspace on this instance will point to it.
      const newOrganization = await tx.organization.create({
        data: {
          name:    `${data.name}'s Org`,
          ownerId: newUser.id,
          // plan defaults to COMMUNITY
        },
      });

      const newWorkspace = await tx.workspace.create({
        data: {
          name: data.workspaceName,
          slug,
          ownerId:        newUser.id,
          organizationId: newOrganization.id,
        },
      });

      // No roles are seeded — the workspace starts empty. The Owner doesn't
      // need a WorkspaceMember row either: requireAccess() / requireWorkspaceFromSlug
      // detect them via Organization.ownerId and bypass every permission check.
      // The Owner creates roles from scratch in Settings → Roles before
      // inviting their first team member.

      // Seed default page templates into the new workspace. Asset URLs in the
      // JSON use {{ASSET}} placeholder; we resolve them to a path scoped under
      // the new workspace's uploads folder (flat — no subfolder). The matching
      // files are copied to disk after the transaction commits (file I/O is
      // non-transactional).
      const assetPrefix = `/uploads/${newWorkspace.id}`;
      const seedTemplates = loadPageTemplatesSeed();
      const seedData = seedTemplates.map((t) => {
        const resolved = resolveAssetPlaceholders(t, assetPrefix);
        return {
          workspaceId: newWorkspace.id,
          name:         resolved.name,
          description:  resolved.description,
          thumbnailUrl: resolved.thumbnailUrl,
          type:         resolved.type,
          tags:         resolved.tags ?? [],
          pageJson:     resolved.pageJson ?? {},
          meta:         resolved.meta ?? {},
          isDefault:    resolved.isDefault ?? false,
          isActive:     resolved.isActive ?? true,
        };
      });
      if (seedData.length > 0) {
        await tx.pageTemplate.createMany({ data: seedData });
      }

      return { user: newUser, workspaceId: newWorkspace.id };
    });

    // Copy asset files outside the DB transaction. Failure here doesn't roll
    // back the account — templates will render with broken images but the
    // workspace is still usable. Logged for ops visibility.
    try {
      copySeedAssetsToWorkspace(workspaceId);
    } catch (e) {
      console.error("[register] seed asset copy failed:", e);
    }

    return ok({ id: user.id, email: user.email, name: user.name }, 201);
  } catch (error) {
    return handleError(error);
  }
}
