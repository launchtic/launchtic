import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { enrollContact } from "../../../../../lib/sequences";

const schema = z.object({ contactId: z.string().min(1) });

type Params = { params: Promise<{ id: string }> };

// Manual enroll endpoint. Default behavior follows the industry pattern:
// reject if the contact has any past enrollment (COMPLETED / EXITED / FAILED),
// returning past metadata so the UI can prompt the operator to confirm.
// `?reenroll=true` overrides — used after the operator confirms in the dialog.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("sequences:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id: sequenceId } = await params;
    const { contactId } = schema.parse(await req.json());
    const allowReenroll = req.nextUrl.searchParams.get("reenroll") === "true";

    const result = await enrollContact({ sequenceId, contactId, workspaceId, allowReenroll });
    if (result.status === "skipped") {
      // already_<status> means the contact already ran this sequence — surface
      // the past metadata as a 200 so the UI can show a confirm-and-retry
      // dialog. Other skip reasons (unsubscribed, bounced, etc.) are terminal.
      if (result.reason.startsWith("already_") && result.past) {
        return ok({
          skipped: true,
          reason: result.reason,
          past: result.past,
        });
      }
      return err(`Cannot enroll: ${result.reason}`, 400);
    }
    return ok({ enrollmentId: result.enrollmentId }, 201);
  } catch (error) {
    return handleError(error);
  }
}
