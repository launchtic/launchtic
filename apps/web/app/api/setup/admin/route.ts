// First-run wizard — Step 1: create the founder admin account.
//
// Hard rule: this endpoint only works when the instance has ZERO users. After
// the first call succeeds, any retry returns 409. Mirrors the same guard
// already in /api/auth/register so a clever attacker can't race past setup.
//
// The created User gets ownership of the auto-provisioned Organization +
// default Workspace (Owner role is implicit via Organization.ownerId).

import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";

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

    // Mirror /api/auth/register's organization + workspace provisioning
    // pattern. Done in a transaction so a partial failure doesn't leave an
    // orphan user.
    const user = await db.$transaction(async (tx) => {
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
      // Slug from the user-provided workspace name (sanitized + truncated).
      const slug = body.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
      await tx.workspace.create({
        data: {
          organizationId: org.id,
          ownerId:        u.id,
          name:           body.workspaceName.trim(),
          slug,
        },
      });
      return u;
    });

    return ok({ userId: user.id });
  } catch (error) {
    return handleError(error);
  }
}
