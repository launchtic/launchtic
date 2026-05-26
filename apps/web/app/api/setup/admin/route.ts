// First-run wizard — Step 1: create the founder admin account.
//
// Hard rule: this endpoint only works when the instance has ZERO users. After
// the first call succeeds, any retry returns 409. Same guard that lived in
// the deleted /api/auth/register, kept identical so a clever attacker can't
// race past setup.
//
// The created User gets ownership of the auto-provisioned Organization +
// default Workspace (Owner role is implicit via Organization.ownerId). Page
// templates from packages/database/src/seed-data are bulk-inserted so the
// editor opens with content from the first click — no empty-state friction.

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

const schema = z.object({
  email:         z.string().email(),
  password:      z.string().min(8, "Password must be at least 8 characters"),
  name:          z.string().min(1).max(100),
  workspaceName: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    // Gate: refuse if any user already exists. This endpoint is FIRST-RUN ONLY.
    const userCount = await db.user.count();
    if (userCount > 0) {
      return err("Setup already completed — an admin account exists.", 409);
    }

    const body = schema.parse(await req.json());
    const passwordHash = await bcrypt.hash(body.password, 10);

    // User + Organization + Workspace + page-template seed run inside one tx
    // so a partial failure doesn't leave an orphan user. Asset file copy is
    // OUTSIDE the tx (file I/O is non-transactional) — runs after commit and
    // logs a warning on failure; the workspace stays usable with broken
    // template thumbnails until the operator re-uploads.
    const workspaceId = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email:        body.email.toLowerCase().trim(),
          passwordHash,
          name:         body.name.trim(),
        },
      });
      const org = await tx.organization.create({
        data: {
          name:    `${body.name.trim()}'s Organization`,
          ownerId: u.id,
          plan:    "COMMUNITY",
        },
      });
      const slug = body.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
      const ws = await tx.workspace.create({
        data: {
          organizationId: org.id,
          ownerId:        u.id,
          name:           body.workspaceName.trim(),
          slug,
        },
      });

      // Seed page templates. Asset URLs in the JSON use {{ASSET}} placeholder;
      // resolve to /uploads/{workspaceId} so the matching files (copied below
      // after the tx commits) resolve via the existing static handler.
      const assetPrefix = `/uploads/${ws.id}`;
      const seedTemplates = loadPageTemplatesSeed();
      const seedData = seedTemplates.map((t) => {
        const resolved = resolveAssetPlaceholders(t, assetPrefix);
        return {
          workspaceId:  ws.id,
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
        await tx.pageTemplate.createMany({ data: seedData as any });
      }

      return ws.id;
    });

    // Copy seed assets to disk OUTSIDE the DB transaction. Failure here
    // doesn't roll back the account — templates render with broken images
    // but the workspace is still usable. Logged for ops visibility.
    try {
      copySeedAssetsToWorkspace(workspaceId);
    } catch (e) {
      console.error("[setup/admin] seed asset copy failed:", e);
    }

    return ok({ workspaceId });
  } catch (error) {
    return handleError(error);
  }
}
