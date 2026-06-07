// Click redirect endpoint.
//
// Looks up the EmailSendLink by token, records the click, fires
// EMAIL_LINK_CLICKED on the FIRST click for that email (additional clicks
// just bump clickCount), then 302-redirects to the original URL.
//
// If the token is unknown (link expired / db dropped), redirect to "/" so
// the recipient still lands somewhere instead of hitting a 404.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { fireTrigger } from "../../../../../../lib/automations";
import { setLtContactCookie } from "../../../../../../lib/identity-cookie";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.emailSendLink.findUnique({
    where: { token },
    include: {
      emailSend: {
        select: {
          id: true, workspaceId: true, contactId: true,
          // Pattern B source columns — decoded into legacy
          // {broadcastId, workflowEmailId} keys inside recordClick so the
          // automations layer's trigger context stays the same.
          sourceType: true, sourceId: true,
          clickedAt: true,
        },
      },
    },
  });

  if (!link) {
    // Unknown / expired token — bounce to root rather than 404.
    return NextResponse.redirect(new URL("/", _req.url), 302);
  }

  // Fire-and-forget — don't block redirect on DB write / trigger fire.
  recordClick(link).catch((err: unknown) => {
    console.error(`[email-track] click record failed for ${token}:`, err);
  });

  // Set lt_contact identity cookie so subsequent funnel page visits fire
  // PAGE_VISITED for this contact (see lib/identity-cookie.ts).
  return setLtContactCookie(NextResponse.redirect(link.url, 302), link.emailSend.contactId);
}

async function recordClick(link: {
  id: string;
  clickedAt: Date | null;
  url: string;
  emailSend: {
    id: string;
    workspaceId: string;
    contactId: string | null;
    sourceType: string | null;
    sourceId:   string | null;
    clickedAt: Date | null;
  };
}): Promise<void> {
  const now = new Date();
  const isFirstLinkClick  = link.clickedAt == null;
  const isFirstEmailClick = link.emailSend.clickedAt == null;

  const workflowEmailId = link.emailSend.sourceType === "WORKFLOW"  ? link.emailSend.sourceId : null;
  const broadcastId     = link.emailSend.sourceType === "BROADCAST" ? link.emailSend.sourceId : null;

  await db.emailSendLink.update({
    where: { id: link.id },
    data: {
      ...(isFirstLinkClick ? { clickedAt: now } : {}),
      clickCount: { increment: 1 },
    },
  });

  await db.emailSend.update({
    where: { id: link.emailSend.id },
    data: {
      ...(isFirstEmailClick ? { clickedAt: now } : {}),
      clickCount: { increment: 1 },
    },
  });

  // Bump WorkflowEmail clickedCount only on first email-level click so the
  // dashboard "click rate" stat reflects unique clickers.
  if (isFirstEmailClick && workflowEmailId) {
    await db.workflowEmail.update({
      where: { id: workflowEmailId },
      data:  { clickedCount: { increment: 1 } },
    }).catch(() => {});
  }

  // Fire the trigger only on the first click for this email — repeat clicks
  // on the same email shouldn't start a new workflow run.
  if (isFirstEmailClick && link.emailSend.contactId) {
    await fireTrigger(link.emailSend.workspaceId, "EMAIL_LINK_CLICKED", {
      contactId:       link.emailSend.contactId,
      emailSendId:     link.emailSend.id,
      broadcastId:     broadcastId     ?? undefined,
      workflowEmailId: workflowEmailId ?? undefined,
      linkUrl:         link.url,
    }).catch((err: unknown) => {
      console.error(`[email-track] EMAIL_LINK_CLICKED trigger failed:`, err);
    });
  }
}
