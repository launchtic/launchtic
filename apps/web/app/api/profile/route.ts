import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError, getUserId } from "../../../lib/api";

const updateSchema = z.object({
  name:            z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(6).max(100).optional(),
}).refine(
  (d) => !(d.newPassword && !d.currentPassword),
  { message: "Current password is required to set a new password." },
);

// PATCH /api/profile — update name and/or password
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return err("Unauthorized", 401);

    const body = updateSchema.parse(await req.json());

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) return err("User not found", 404);

    // Verify current password before allowing password change.
    if (body.newPassword) {
      const valid = await bcrypt.compare(body.currentPassword!, user.passwordHash);
      if (!valid) return err("Current password is incorrect.", 400);
    }

    const data: Record<string, unknown> = {};
    if (body.name)        data.name         = body.name;
    if (body.newPassword) data.passwordHash  = await bcrypt.hash(body.newPassword, 10);

    await db.user.update({ where: { id: userId }, data });

    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}
