// Visit tracking endpoint — fires PAGE_VISITED for the contact identified
// by the `lt_contact` cookie (set on email-link click in
// /api/email/track/click/[token]). Anonymous visitors (no cookie) silently
// no-op so the endpoint is safe to call from every funnel page.
//
// Same fire-and-forget pattern as the open/click trackers: respond 204
// immediately, fire the trigger asynchronously so the page render isn't
// blocked by trigger fanout.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { fireTrigger } from "../../../../lib/automations";
import { redis } from "../../../../lib/redis";

// Same 1h dedupe window as the server-side fire in [[...slug]]/page.tsx
// so this endpoint and the server-render path share one cooldown bucket.
const PAGE_VISITED_DEDUPE_TTL_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const funnelStepId = typeof body?.funnelStepId === "string" ? body.funnelStepId : null;
    if (!funnelStepId) return NextResponse.json({ ok: true }, { status: 204 });

    const contactId = req.cookies.get("lt_contact")?.value;
    if (!contactId) {
      // Anonymous visitor — no identity, no trigger. Return 204 so the
      // client-side pixel doesn't retry / log a console error.
      return new NextResponse(null, { status: 204 });
    }

    // Fire-and-forget: resolve step + workspace + verify contact ownership,
    // then fire the trigger. Errors swallowed (.catch) so a stale cookie or
    // deleted contact doesn't surface a 500 to the recipient.
    void recordVisit(contactId, funnelStepId);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

async function recordVisit(contactId: string, funnelStepId: string): Promise<void> {
  // Atomic dedupe lock — same pattern as the server-render path. Reload
  // spam fires this endpoint per page load; without the lock, every
  // reload would re-enroll the contact into the workflow (since a
  // `PAGE_VISITED → SEND_EMAIL → END` run completes fast and unblocks
  // SINGLE_ACTIVE).
  const dedupeKey = `pv:${contactId}:${funnelStepId}`;
  const acquired  = await redis.set(dedupeKey, "1", "EX", PAGE_VISITED_DEDUPE_TTL_SECONDS, "NX");
  if (acquired !== "OK") return;

  // Resolve funnel + workspace from the step; verify the contact exists in
  // the same workspace (defense against stolen cookies pointing at a
  // contact from a different account).
  const step = await db.funnelStep.findUnique({
    where:  { id: funnelStepId },
    select: { funnel: { select: { id: true, workspaceId: true } } },
  });
  if (!step) return;

  const contact = await db.contact.findFirst({
    where:  { id: contactId, workspaceId: step.funnel.workspaceId },
    select: { id: true },
  });
  if (!contact) return;

  await fireTrigger(step.funnel.workspaceId, "PAGE_VISITED", {
    contactId:    contact.id,
    funnelId:     step.funnel.id,
    funnelStepId,
  }).catch((err: unknown) => {
    console.error(`[track-visit] PAGE_VISITED trigger failed:`, err);
  });
}
