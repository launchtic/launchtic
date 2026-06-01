// Open pixel endpoint.
//
// Returns a 1x1 transparent GIF immediately so the recipient's email client
// renders without waiting for our DB write. The actual EmailSend.openedAt
// update + EMAIL_OPENED trigger fire run in the background — failures don't
// affect the response.
//
// 1-minute cooldown: most prefetch / image-proxy hits arrive within 60s of
// the open. We update openedAt only on the FIRST hit (so analytics don't
// inflate from Gmail's pre-fetch), but always bump openCount so operators
// can spot suspicious re-opens.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { fireTrigger } from "../../../../../../lib/automations";

// Pre-baked 1x1 transparent GIF89a (43 bytes).
const PIXEL_BYTES = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ emailSendId: string }> }) {
  const { emailSendId } = await params;

  // Fire-and-forget — never block on tracking writes.
  recordOpen(emailSendId).catch((err: unknown) => {
    console.error(`[email-track] open record failed for ${emailSendId}:`, err);
  });

  return new NextResponse(PIXEL_BYTES, {
    status: 200,
    headers: {
      "Content-Type":  "image/gif",
      "Content-Length": String(PIXEL_BYTES.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma":        "no-cache",
    },
  });
}

async function recordOpen(emailSendId: string): Promise<void> {
  const send = await db.emailSend.findUnique({
    where:  { id: emailSendId },
    select: {
      id: true, workspaceId: true, contactId: true,
      broadcastId: true, workflowEmailId: true, openedAt: true,
    },
  });
  if (!send) return;

  const isFirstOpen = send.openedAt == null;
  await db.emailSend.update({
    where: { id: emailSendId },
    data: {
      ...(isFirstOpen ? { openedAt: new Date() } : {}),
      openCount: { increment: 1 },
    },
  });

  // Bump the WorkflowEmail's openedCount only on first open per send, so the
  // dashboard "open rate" stat reflects unique opens not total hits.
  if (isFirstOpen && send.workflowEmailId) {
    await db.workflowEmail.update({
      where: { id: send.workflowEmailId },
      data:  { openedCount: { increment: 1 } },
    }).catch(() => {});
  }

  // Fire the trigger only on the FIRST open — subsequent re-opens don't
  // start new workflow runs (cap via re-enroll policy on the workflow).
  if (isFirstOpen && send.contactId) {
    await fireTrigger(send.workspaceId, "EMAIL_OPENED", {
      contactId:       send.contactId,
      emailSendId:     send.id,
      broadcastId:     send.broadcastId     ?? undefined,
      workflowEmailId: send.workflowEmailId ?? undefined,
    }).catch((err: unknown) => {
      console.error(`[email-track] EMAIL_OPENED trigger failed for ${emailSendId}:`, err);
    });
  }
}
