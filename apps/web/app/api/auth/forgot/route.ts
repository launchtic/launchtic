import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { sendEmail } from "@launchtic/email/server";
import { ok, handleError } from "../../../../lib/api";
import {
  generateResetToken,
  resolveResetEmailSender,
  buildResetEmailHtml,
  RESET_TOKEN_TTL_MS,
} from "../../../../lib/password-reset";

const schema = z.object({
  email: z.string().email(),
});

// POST /api/auth/forgot — start the password reset flow.
//
// ALWAYS returns success regardless of:
//   - whether the email matches a real user (prevents enumeration)
//   - whether the email actually got sent (some users may have no SMTP yet —
//     we log the warning server-side and let the user wonder why nothing
//     arrived, which is no worse than a silent SMTP failure)
// The only failure mode that surfaces is malformed input (zod rejection).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Silent success — don't reveal whether the email is registered.
    if (!user) return ok({ sent: true });

    const sender = await resolveResetEmailSender(user.id);
    if (!sender) {
      // Case 3 (deferred): no workspace SMTP available. Log + silent success.
      console.warn(`[forgot-password] no SMTP available for user ${user.id} (${email})`);
      return ok({ sent: true });
    }

    const { raw, hash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });

    // Build absolute reset URL from the request host so it works across
    // deploys (custom domain, localhost dev, etc.) without env config.
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    const resetUrl = `${origin}/reset?token=${raw}`;

    try {
      await sendEmail(sender.smtp, {
        to:        user.email,
        subject:   "Reset your Launchtic password",
        html:      buildResetEmailHtml({ email: user.email, resetUrl, expiresIn: "1 hour" }),
        fromEmail: sender.fromEmail,
        fromName:  sender.fromName,
      });
    } catch (e) {
      // Don't surface SMTP errors to the caller (still enumeration-safe).
      // The token row exists; user can hit "request another" if no email
      // arrives. Logged for ops.
      console.error(`[forgot-password] sendEmail failed for ${email}:`, e);
    }

    return ok({ sent: true });
  } catch (error) {
    return handleError(error);
  }
}
