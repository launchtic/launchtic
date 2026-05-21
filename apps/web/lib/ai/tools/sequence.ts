// Email sequence (drip campaign) tools — list, get details, create from spec,
// add/update step, pause/activate.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { getDefaultSender, richBodyToMailyDoc, textToMailyDoc, type RichEmailBody } from "./helpers";

// Body schema — accepts string OR rich object (same pattern as broadcast.ts).
// Defensive against LLMs falling back to plain string format.
const richBodySchema = z.union([
  z.string().describe("Plain text fallback. Renders as bare paragraphs only — prefer the object form for richer layout."),
  z.object({
    heading: z.string().optional().describe("Optional H2 heading. Specific and benefit-focused, not generic."),
    paragraphs: z.array(z.string()).min(1).describe("Body paragraphs in order. 2-4 short paragraphs. Variables like {{contact.firstName}} supported."),
    cta: z.object({
      text: z.string().describe("Button label, e.g. 'Get started', 'Read the guide'."),
      url:  z.string().default("#").describe("Click target. Use '#' if no specific URL."),
    }).optional().describe("Optional CTA button after paragraphs."),
    footer: z.string().optional().describe("Optional small footer text, centered."),
  }),
]).describe("Email body. Object form {heading, paragraphs, cta, footer} for rich layout, or plain string as fallback.");

// Unsubscribe footer is NOT injected here — the sequence worker handles
// it at render time via marketingRenderOptions.
function bodyToMaily(body: string | RichEmailBody): string {
  return typeof body === "string" ? textToMailyDoc(body) : richBodyToMailyDoc(body);
}
import { resolveSequenceLabel } from "./resolvers";

// ─── Reads ──────────────────────────────────────────────────────────────────

const listSequences = defineTool({
  name: "list_sequences",
  description: "List email sequences (drip campaigns) with status and enrollment counts.",
  inputSchema: z.object({
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
  }),
  requiresConfirm: false,
  requiredPermission: "sequences:read",
  execute: async ({ status }, ctx) => {
    const sequences = await db.emailSequence.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status && { status }) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, status: true,
        activeCount: true, completedCount: true, exitedCount: true,
        _count: { select: { steps: true } },
      },
    });
    return {
      count: sequences.length,
      sequences: sequences.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stepCount: s._count.steps,
        active: s.activeCount,
        completed: s.completedCount,
        exited: s.exitedCount,
      })),
    };
  },
});

const getSequenceDetails = defineTool({
  name: "get_sequence_details",
  description: "Get full structure of a sequence: all steps with their delays, subjects, IDs. Use BEFORE update_sequence_step to find stepId.",
  inputSchema: z.object({
    sequenceId: z.string(),
  }),
  requiresConfirm: false,
  requiredPermission: "sequences:read",
  execute: async ({ sequenceId }, ctx) => {
    const seq = await db.emailSequence.findFirst({
      where: { id: sequenceId, workspaceId: ctx.workspaceId },
      select: {
        id: true, name: true, status: true,
        steps: {
          orderBy: { order: "asc" },
          select: {
            id: true, order: true, delayMinutes: true,
            emailSubject: true, emailFromName: true, emailFromEmail: true,
          },
        },
      },
    });
    if (!seq) return { error: "Sequence not found" };
    return {
      id: seq.id,
      name: seq.name,
      status: seq.status,
      steps: seq.steps.map((s) => ({
        id: s.id,
        order: s.order,
        delayDays: Math.round(s.delayMinutes / (60 * 24) * 10) / 10,
        subject: s.emailSubject,
        from: `${s.emailFromName} <${s.emailFromEmail}>`,
      })),
    };
  },
});

// ─── Writes ─────────────────────────────────────────────────────────────────

const updateSequenceStatus = defineTool({
  name: "update_sequence_status",
  description: "Pause or activate an email sequence. Use list_sequences to find the ID.",
  inputSchema: z.object({
    sequenceId: z.string(),
    status:     z.enum(["ACTIVE", "PAUSED"]),
  }),
  requiresConfirm: true,
  requiredPermission: "sequences:write",
  summary: async (a, ctx) => {
    const label = await resolveSequenceLabel(a.sequenceId, ctx);
    return `${a.status === "ACTIVE" ? "Activate" : "Pause"} sequence "${label}"`;
  },
  execute: async (args, ctx) => {
    const seq = await db.emailSequence.findFirst({
      where: { id: args.sequenceId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!seq) throw new Error("Sequence not found");
    await db.emailSequence.update({ where: { id: seq.id }, data: { status: args.status as any } });
    return { id: seq.id, name: seq.name, previousStatus: seq.status, newStatus: args.status };
  },
});

const createSequenceFromSpec = defineTool({
  name: "create_sequence_from_spec",
  description:
    "Create an email drip sequence (welcome series, onboarding, nurture). " +
    "Each step is one email + delay-from-previous. Step 1 has delay=0 (sends immediately on enrollment). " +
    "Each step's body is structured (heading + paragraphs + optional CTA + footer). Sequence is created as DRAFT.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Sequence name, e.g. 'Welcome 7-day'."),
    steps: z.array(z.object({
      delayDays:    z.number().min(0).default(0).describe("Days to wait after the PREVIOUS step (0 for first step = send immediately on enrollment)."),
      emailSubject: z.string().min(1),
      emailBody:    richBodySchema,
    })).min(1).describe("Ordered steps. First step has delayDays=0 (immediate)."),
  }),
  requiresConfirm: true,
  requiredPermission: "sequences:write",
  summary: (a) => {
    const stepSummary = a.steps.map((s, i) =>
      `${i + 1}) ${s.delayDays === 0 ? "immediate" : `+${s.delayDays}d`}: "${s.emailSubject}"`,
    ).join(" · ");
    return `Create sequence "${a.name}" with ${a.steps.length} step(s):\n${stepSummary}`;
  },
  execute: async (args, ctx) => {
    return await db.$transaction(async (tx) => {
      const sender = await getDefaultSender(ctx);

      const seq = await tx.emailSequence.create({
        data: { workspaceId: ctx.workspaceId, name: args.name, status: "DRAFT" },
      });

      for (const [idx, step] of args.steps.entries()) {
        await tx.sequenceStep.create({
          data: {
            sequenceId: seq.id,
            order: idx,
            delayMinutes: Math.round((step.delayDays ?? 0) * 24 * 60),
            emailSubject: step.emailSubject,
            emailHtmlBody: bodyToMaily(step.emailBody),
            emailFromName: sender.name,
            emailFromEmail: sender.email,
          },
        });
      }

      return {
        sequenceId: seq.id,
        name: seq.name,
        stepCount: args.steps.length,
        message: `Sequence saved as DRAFT. [Open in editor](/${ctx.workspaceSlug}/sequences/${seq.id}) to review, then activate.`,
      };
    });
  },
});

const addSequenceStep = defineTool({
  name: "add_sequence_step",
  description: "Add a new step to the end of an existing sequence. Use list_sequences to find sequenceId. Sequence must NOT be ACTIVE (pause first).",
  inputSchema: z.object({
    sequenceId:   z.string(),
    delayDays:    z.number().min(0).default(1),
    emailSubject: z.string().min(1),
    emailBody:    richBodySchema,
  }),
  requiresConfirm: true,
  requiredPermission: "sequences:write",
  summary: async (a, ctx) => {
    const label = await resolveSequenceLabel(a.sequenceId, ctx);
    return `Add step (+${a.delayDays}d, "${a.emailSubject}") to sequence "${label}"`;
  },
  execute: async (args, ctx) => {
    return await db.$transaction(async (tx) => {
      const seq = await tx.emailSequence.findFirst({
        where: { id: args.sequenceId, workspaceId: ctx.workspaceId },
        select: { id: true, status: true, _count: { select: { steps: true } } },
      });
      if (!seq) throw new Error("Sequence not found");
      if (seq.status === "ACTIVE") {
        throw new Error("Cannot add step to ACTIVE sequence. Pause it first.");
      }
      const sender = await getDefaultSender(ctx);
      const step = await tx.sequenceStep.create({
        data: {
          sequenceId: seq.id,
          order: seq._count.steps,
          delayMinutes: Math.round((args.delayDays ?? 1) * 24 * 60),
          emailSubject: args.emailSubject,
          emailHtmlBody: bodyToMaily(args.emailBody),
          emailFromName: sender.name,
          emailFromEmail: sender.email,
        },
      });
      return { stepId: step.id, order: step.order, sequenceId: seq.id };
    });
  },
});

const updateSequenceStep = defineTool({
  name: "update_sequence_step",
  description: "Update a single sequence step. Content edits (subject, body) are allowed even on ACTIVE sequences. Delay changes require pausing first. Body update REPLACES existing content.",
  inputSchema: z.object({
    stepId:       z.string().describe("SequenceStep ID. Use get_sequence_details to find (or list_sequences and inspect the steps)."),
    delayDays:    z.number().min(0).optional(),
    emailSubject: z.string().optional(),
    emailBody:    richBodySchema.optional().describe("Replaces existing body entirely."),
  }),
  requiresConfirm: true,
  requiredPermission: "sequences:write",
  summary: async (a, ctx) => {
    const step = await db.sequenceStep.findFirst({
      where: { id: a.stepId, sequence: { workspaceId: ctx.workspaceId } },
      select: { emailSubject: true, sequence: { select: { name: true } } },
    });
    const fields = [
      a.delayDays !== undefined && "delay",
      a.emailSubject && "subject",
      a.emailBody && "body",
    ].filter(Boolean).join(", ");
    return `Update step "${step?.emailSubject ?? a.stepId}" in "${step?.sequence.name ?? "sequence"}" (${fields || "no fields"})`;
  },
  execute: async (args, ctx) => {
    const step = await db.sequenceStep.findFirst({
      where: { id: args.stepId, sequence: { workspaceId: ctx.workspaceId } },
      select: { id: true, sequence: { select: { id: true, status: true } } },
    });
    if (!step) throw new Error("Sequence step not found");

    // Block delay change on ACTIVE — would re-time enrollments unpredictably
    if (args.delayDays !== undefined && step.sequence.status === "ACTIVE") {
      throw new Error("Cannot change delay on ACTIVE sequence. Pause it first.");
    }

    const data: Record<string, unknown> = {};
    if (args.delayDays !== undefined) data.delayMinutes = Math.round(args.delayDays * 24 * 60);
    if (args.emailSubject)            data.emailSubject = args.emailSubject;
    if (args.emailBody)               data.emailHtmlBody = bodyToMaily(args.emailBody);

    const updated = await db.sequenceStep.update({ where: { id: step.id }, data });
    return { stepId: updated.id, updatedFields: Object.keys(data) };
  },
});

export const sequenceTools = [
  listSequences,
  getSequenceDetails,
  updateSequenceStatus,
  createSequenceFromSpec,
  addSequenceStep,
  updateSequenceStep,
];
