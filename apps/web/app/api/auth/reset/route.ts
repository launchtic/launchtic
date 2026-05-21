import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { hashResetToken } from "../../../../lib/password-reset";

const resetSchema = z.object({
  token:    z.string().min(32),
  password: z.string().min(6),
});

// GET /api/auth/reset?token=... — pre-validate a token before showing the
// new-password form. UI uses this so we can surface "link expired" before
// the user types a password.
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("token");
    if (!raw) return err("Missing token", 400);

    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(raw) },
      select: { expiresAt: true, usedAt: true },
    });
    if (!row)                                    return err("Invalid or expired link.", 400);
    if (row.usedAt)                              return err("This link was already used.", 400);
    if (row.expiresAt < new Date())              return err("This link expired.", 400);

    return ok({ valid: true });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/auth/reset — set a new password using a valid token.
// On success:
//   - update user.passwordHash (bcrypt 12 rounds, same as register)
//   - mark token usedAt
//   - delete all OTHER tokens for this user (invalidate concurrent attempts)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = resetSchema.parse(body);

    const tokenHash = hashResetToken(token);
    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!row)                       return err("Invalid or expired link.", 400);
    if (row.usedAt)                 return err("This link was already used.", 400);
    if (row.expiresAt < new Date()) return err("This link expired.", 400);

    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // Invalidate any other outstanding tokens for this user.
      db.passwordResetToken.deleteMany({
        where: { userId: row.userId, id: { not: row.id }, usedAt: null },
      }),
    ]);

    return ok({ reset: true });
  } catch (error) {
    return handleError(error);
  }
}
