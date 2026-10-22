// First-run wizard — Step 1: create the founder admin account.
//
// Hard rule: this endpoint only works when the instance has ZERO users. After
// the first call succeeds, any retry returns 409. Same guard that lived in
// the deleted /api/auth/register, kept identical so a clever attacker can't
// race past setup.
//
// The created User gets ownership of the auto-provisioned Organization +
// default Workspace (Owner role is implicit via Organization.ownerId). Starter
// page templates (.ltbundle files in packages/database/src/seed-data/templates)
// are imported so the editor opens with content from the first click — no
// empty-state friction.

import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { loadSeedTemplateBundles } from "../../../../lib/seed-data";
import { importBundle } from "../../../../lib/template-import";
import { decodeBundle } from "../../../../lib/template-bundle";

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
    const { workspaceId } = await db.$transaction(async (tx) => {
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
          // plan left NULL = Free; a license key is activated later in
          // Settings → License & Updates.
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


      return { workspaceId: ws.id, organizationId: org.id };
    });

    // Import starter templates OUTSIDE the DB transaction (importBundle writes
    // image files through the storage driver). A failure doesn't roll back the
    // account — the workspace just starts with fewer templates. The bundle's
    // isDefault flag marks the template the AI funnel builder picks per type.
    try {
      for (const { file, buf } of loadSeedTemplateBundles()) {
        try {
          const { id } = await importBundle(workspaceId, buf);
          if (decodeBundle(buf).manifest.template.isDefault) {
            await db.pageTemplate.update({ where: { id }, data: { isDefault: true } });
          }
        } catch (e) {
          console.error(`[setup/admin] seed template ${file} failed:`, e);
        }
      }
    } catch (e) {
      console.error("[setup/admin] seed templates failed:", e);
    }

    return ok({ workspaceId });
  } catch (error) {
    return handleError(error);
  }
}
