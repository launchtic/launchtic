import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

// Cap one bulk-enroll request to keep the inline transaction reasonable. Tags
// larger than this should be split, or this endpoint should be moved to a
// queue worker. 5000 covers typical "VIP" / "newsletter" segments.
const MAX_PER_REQUEST = 5000;

const schema = z.object({ tagId: z.string().min(1) });

type Params = { params: Promise<{ id: string }> };

// Bulk-enroll every contact tagged with `tagId` into the given sequence.
// Skips contacts that are: unsubscribed, bounced, or already in an ACTIVE
// enrollment for this sequence. Idempotent — re-running with the same tag
// only adds newly-tagged contacts.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("sequences:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id: sequenceId } = await params;
    const { tagId } = schema.parse(await req.json());

    const sequence = await db.emailSequence.findFirst({
      where: { id: sequenceId, workspaceId },
      include: { steps: { orderBy: { order: "asc" }, take: 1 } },
    });
    if (!sequence) return err("Sequence not found", 404);
    if (sequence.status !== "ACTIVE") {
      return err(`Sequence is ${sequence.status.toLowerCase()} — activate it first`, 400);
    }
    if (sequence.steps.length === 0) {
      return err("Sequence has no steps", 400);
    }

    const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId } });
    if (!tag) return err("Tag not found", 404);

    // Pull eligible contacts: tagged + not unsub/bounced + never enrolled in
    // this sequence before (any status). Industry default — re-enrolling
    // contacts who already finished or exited is almost always unintended
    // and looks like spam to recipients. Operators who genuinely want to
    // re-enroll a specific contact can use the single-enroll flow with the
    // confirm-override dialog.
    const candidates = await db.contact.findMany({
      where: {
        workspaceId,
        unsubscribedAt: null,
        bouncedAt: null,
        tags: { some: { tagId } },
        sequenceEnrollments: {
          none: { sequenceId },
        },
      },
      take: MAX_PER_REQUEST + 1, // peek one extra to detect overflow
      select: { id: true },
    });

    const overflow = candidates.length > MAX_PER_REQUEST;
    const eligible = overflow ? candidates.slice(0, MAX_PER_REQUEST) : candidates;

    if (eligible.length === 0) {
      return ok({ enrolled: 0, skipped: 0, overflow: false });
    }

    const firstDelay = sequence.steps[0].delayMinutes;
    const nextSendAt = new Date(Date.now() + firstDelay * 60_000);

    const created = await db.$transaction(async (tx) => {
      await tx.contactSequenceEnrollment.createMany({
        data: eligible.map((c) => ({
          sequenceId,
          contactId: c.id,
          workspaceId,
          status: "ACTIVE" as const,
          currentStepIndex: 0,
          nextSendAt,
        })),
        skipDuplicates: true, // belt-and-suspenders: partial unique index also enforces
      });

      // Re-fetch actual created count (skipDuplicates may have dropped some).
      const count = await tx.contactSequenceEnrollment.count({
        where: {
          sequenceId,
          contactId: { in: eligible.map((c) => c.id) },
          status: "ACTIVE",
        },
      });

      await tx.emailSequence.update({
        where: { id: sequenceId },
        data: {
          totalEnrolled: { increment: count },
          activeCount:   { increment: count },
        },
      });

      return count;
    });

    return ok({
      enrolled: created,
      skipped: eligible.length - created,
      overflow,
      maxPerRequest: MAX_PER_REQUEST,
    });
  } catch (error) {
    return handleError(error);
  }
}
