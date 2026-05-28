import { db } from "@launchtic/database";
import { redis } from "./redis";

// Per-visitor session id. The renderer middleware (apps/renderer/middleware.ts)
// reads/sets the `lt_sid` cookie and forwards the value on this request header
// so server components AND route handlers read a single consistent id within
// the same request.
export const SID_HEADER = "x-lt-sid";

// VIEW dedup window. A reload / prefetch / back-button by the SAME session on
// the SAME step within this window counts as a single view — otherwise a
// visitor spamming F5 would inflate view counts and dilute conversion rates.
// 30 min ≈ a "session view"; a genuine revisit later still counts again.
const VIEW_DEDUP_SECONDS = 30 * 60;

type RecordInput = {
  type: "VIEW" | "LEAD" | "PURCHASE";
  funnelStepId: string;
  /** Pass when known (VIEW has it from page data); otherwise resolved from the step. */
  funnelId?: string;
  sessionId?: string | null;
  contactId?: string | null;
  orderId?: string | null;
  amountCents?: number | null;
  ip?: string | null;
};

/**
 * Append a FunnelEvent for analytics (and, later, A/B attribution).
 *
 * Best-effort and fully swallowed on error: a tracking failure must NEVER
 * break a funnel page render or a checkout. Resolves funnelId from the step
 * when the caller doesn't already have it (one indexed lookup).
 */
export async function recordFunnelEvent(input: RecordInput): Promise<void> {
  try {
    // Collapse repeat VIEWs (reload / prefetch / back-forward) from the same
    // session on the same step into one. SET NX EX is atomic: it succeeds only
    // for the first view in the window. Fail-open on a Redis hiccup — better to
    // over-count than to silently drop every view while Redis is down.
    if (input.type === "VIEW" && input.sessionId && input.sessionId !== "unknown") {
      try {
        const key = `fview:${input.sessionId}:${input.funnelStepId}`;
        const set = await redis.set(key, "1", "EX", VIEW_DEDUP_SECONDS, "NX");
        if (set === null) return; // already counted within the window
      } catch {
        /* Redis unavailable — record anyway */
      }
    }

    let funnelId = input.funnelId;
    if (!funnelId) {
      const step = await db.funnelStep.findUnique({
        where: { id: input.funnelStepId },
        select: { funnelId: true },
      });
      if (!step) return; // step gone — nothing to attribute
      funnelId = step.funnelId;
    }

    await db.funnelEvent.create({
      data: {
        funnelId,
        stepId:      input.funnelStepId,
        type:        input.type,
        // "unknown" only if the middleware somehow didn't run — keeps the row
        // valid while flagging un-stitched events in analytics.
        sessionId:   input.sessionId || "unknown",
        contactId:   input.contactId ?? null,
        orderId:     input.orderId ?? null,
        amountCents: input.amountCents ?? null,
        ip:          input.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[funnel-event] record failed:", e);
  }
}
