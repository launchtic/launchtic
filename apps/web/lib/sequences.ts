// Sequence enrollment & exit helpers.
//
// Used by:
//   - Worker (automation processor) when action = START_SEQUENCE
//   - Worker (sequence tick) when checking exit conditions before each step
//   - API route /api/sequences/[id]/enroll for manual enroll
//   - Webhooks (purchase, unsubscribe) to mass-exit affected enrollments

import { db } from "@launchtic/database";

export type EnrollResult =
  | { status: "enrolled"; enrollmentId: string }
  | { status: "skipped"; reason: string; past?: { status: string; completedAt: string | null } };

/**
 * Enroll a contact in a sequence.
 *
 * Re-entry policy (industry default — ConvertKit / ActiveCampaign / Klaviyo):
 *   - If contact has any past enrollment in this sequence (ACTIVE / COMPLETED
 *     / EXITED / FAILED) and `allowReenroll` is false (default), skip with
 *     reason `already_<status>` and return past metadata so callers can
 *     prompt the user.
 *   - If `allowReenroll: true`, create a fresh enrollment regardless of past.
 *   - ACTIVE past is always idempotent — returns the existing enrollmentId
 *     without re-creating, even with `allowReenroll: true` (no point firing
 *     the same sequence twice in parallel).
 *
 * The first step is scheduled at `now + step[0].delayMinutes`. Step 1 with
 * delay=0 means "send immediately on the next scheduler tick" (≤60s).
 */
export async function enrollContact(opts: {
  sequenceId: string;
  contactId: string;
  workspaceId: string;
  allowReenroll?: boolean;
  enrolledByAutomationId?: string | null;
  enrolledByRunId?: string | null;
}): Promise<EnrollResult> {
  const { sequenceId, contactId, workspaceId, allowReenroll = false } = opts;

  const sequence = await db.emailSequence.findFirst({
    where: { id: sequenceId, workspaceId },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });
  if (!sequence) return { status: "skipped", reason: "sequence_not_found" };
  if (sequence.status !== "ACTIVE") {
    return { status: "skipped", reason: `sequence_${sequence.status.toLowerCase()}` };
  }
  if (sequence.steps.length === 0) {
    return { status: "skipped", reason: "sequence_has_no_steps" };
  }

  // Compliance gate — never enroll an unsubscribed/bounced contact.
  const contact = await db.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { unsubscribedAt: true, bouncedAt: true },
  });
  if (!contact) return { status: "skipped", reason: "contact_not_found" };
  if (contact.unsubscribedAt) return { status: "skipped", reason: "contact_unsubscribed" };
  if (contact.bouncedAt)      return { status: "skipped", reason: "contact_bounced" };

  // Re-entry check — most recent past enrollment in this sequence.
  const past = await db.contactSequenceEnrollment.findFirst({
    where: { sequenceId, contactId },
    orderBy: { enrolledAt: "desc" },
    select: { id: true, status: true, completedAt: true },
  });
  if (past?.status === "ACTIVE") {
    // Always idempotent — no double-enroll while one is in flight.
    return { status: "enrolled", enrollmentId: past.id };
  }
  if (past && !allowReenroll) {
    return {
      status: "skipped",
      reason: `already_${past.status.toLowerCase()}`,
      past: {
        status: past.status,
        completedAt: past.completedAt?.toISOString() ?? null,
      },
    };
  }

  const firstDelay = sequence.steps[0].delayMinutes;
  const nextSendAt = new Date(Date.now() + firstDelay * 60_000);

  const enrollment = await db.contactSequenceEnrollment.create({
    data: {
      sequenceId,
      contactId,
      workspaceId,
      status: "ACTIVE",
      currentStepIndex: 0,
      nextSendAt,
      enrolledByAutomationId: opts.enrolledByAutomationId ?? null,
      enrolledByRunId: opts.enrolledByRunId ?? null,
    },
    select: { id: true },
  });

  await db.emailSequence.update({
    where: { id: sequenceId },
    data: {
      totalEnrolled: { increment: 1 },
      activeCount: { increment: 1 },
    },
  });

  // Timeline event for the contact's activity feed.
  await db.contactEvent.create({
    data: {
      contactId,
      type: "SEQUENCE_ENROLLED",
      data: { sequenceId, enrollmentId: enrollment.id, source: opts.enrolledByAutomationId ? "automation" : "manual" },
    },
  }).catch(() => {});

  return { status: "enrolled", enrollmentId: enrollment.id };
}

/**
 * Mass-exit all ACTIVE enrollments for a contact across a workspace. Used by
 * the unsubscribe webhook to honor compliance, and available as a building
 * block for any "remove from all sequences" flow.
 */
export async function exitEnrollmentsForContact(opts: {
  contactId: string;
  workspaceId: string;
  reason: string;
}): Promise<number> {
  const { contactId, workspaceId, reason } = opts;

  const enrollments = await db.contactSequenceEnrollment.findMany({
    where: { contactId, workspaceId, status: "ACTIVE" },
    select: { id: true, sequenceId: true },
  });

  if (enrollments.length === 0) return 0;

  const ids = enrollments.map((e) => e.id);
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequenceId))];

  await db.$transaction([
    db.contactSequenceEnrollment.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "EXITED",
        exitReason: reason,
        completedAt: new Date(),
      },
    }),
    // Decrement activeCount + increment exitedCount per affected sequence.
    ...sequenceIds.map((sid) => {
      const count = enrollments.filter((e) => e.sequenceId === sid).length;
      return db.emailSequence.update({
        where: { id: sid },
        data: {
          activeCount: { decrement: count },
          exitedCount: { increment: count },
        },
      });
    }),
    // One ContactEvent per affected sequence — surfaces in the contact's
    // timeline as "Exited from <sequence>" with the reason.
    ...sequenceIds.map((sid) =>
      db.contactEvent.create({
        data: { contactId, type: "SEQUENCE_EXITED", data: { sequenceId: sid, reason } },
      }),
    ),
  ]);

  return ids.length;
}
