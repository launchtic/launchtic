// Broadcast tools — list, create from spec, update DRAFT, cancel SCHEDULED.
// Note: actual queue dispatch is handled by /api/broadcasts/[id]/send.
// AI tool only creates the DB row; operator clicks Send/Schedule in UI.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { findOrSkipTag, getDefaultSender, richBodyToCraftDoc, textToCraftDoc, type RichEmailBody } from "./helpers";
import { broadcastQueue, dispatchJobId } from "../../queue";

const MIN_LEAD_TIME_MS = 10 * 60_000;

// Buffer added to MIN_LEAD_TIME for the auto-bump path. Keeps us safely
// above the queue tick threshold even if the request takes a few seconds.
const AUTO_BUMP_BUFFER_MS = 60_000;

// Resolve user's requested scheduledAt into a final datetime that satisfies
// the queue's minimum lead time. If the request is too close to "now", we
// gently push it forward to (now + min lead + buffer) instead of throwing —
// matches user intent ("send soon") + keeps queue happy. Returns the final
// datetime + a flag indicating whether we bumped.
function resolveScheduledAt(requested: Date, now: Date): { final: Date; bumped: boolean } {
  const minAllowed = new Date(now.getTime() + MIN_LEAD_TIME_MS);
  if (requested.getTime() < minAllowed.getTime()) {
    return { final: new Date(now.getTime() + MIN_LEAD_TIME_MS + AUTO_BUMP_BUFFER_MS), bumped: true };
  }
  return { final: requested, bumped: false };
}

// Workspace must have SMTP configured before any SCHEDULED/immediate send —
// otherwise worker picks up the job and fails the whole batch. Mirrors check
// in /api/broadcasts/[id]/send route.
async function ensureSmtpConfigured(workspaceId: string) {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
  if (!smtp?.host || !smtp?.password) {
    throw new Error("SMTP not configured. Configure it in Settings → SMTP first.");
  }
}

// Validate scheduledAt + enqueue dispatch job. Removes any prior job for this
// broadcast (idempotent re-schedule). Updates DB to status=SCHEDULED.
async function scheduleBroadcastDispatch(opts: {
  broadcastId: string;
  workspaceId: string;
  scheduledAt: Date;
}) {
  const delay = opts.scheduledAt.getTime() - Date.now();
  if (delay < MIN_LEAD_TIME_MS) {
    throw new Error("scheduledAt must be at least 10 minutes in the future.");
  }
  const queue = broadcastQueue();
  const jobId = dispatchJobId(opts.broadcastId);
  // Remove prior job (idempotent — no-op if none exists)
  try { await queue.remove(jobId); } catch {}
  await queue.add(
    "dispatch",
    { broadcastId: opts.broadcastId, workspaceId: opts.workspaceId },
    { jobId, delay },
  );
}

// Body schema — accepts EITHER a plain string OR a rich structured object.
// Why both: LLMs occasionally fall back to string ("Hi name,\n\nText...")
// even when schema asks for object — likely from training-data prior. Rather
// than reject and force a retry (slow + token-burning), accept both shapes
// and route to the appropriate Craft-doc converter.
//
// Recommended shape (for polished output): the object form. Plain string
// renders as bare paragraphs only — no heading, no button.
const richBodySchema = z.union([
  z.string().describe("Plain text fallback. Paragraphs separated by blank lines. Renders as bare paragraphs only — prefer the object form for richer layout."),
  z.object({
    heading: z.string().optional().describe("Optional H2 heading — punchy, specific. E.g. 'Your Black Friday deals start now'."),
    paragraphs: z.array(z.string()).min(1).describe("Body paragraphs in order. 2-4 short paragraphs. Variables like {{contact.firstName}} supported."),
    cta: z.object({
      text: z.string().describe("Button label, e.g. 'Shop now', 'Read more'."),
      url:  z.string().default("#").describe("Click target. Use '#' if no specific URL."),
    }).optional().describe("Optional CTA button after paragraphs. Include for promo/marketing emails."),
    footer: z.string().optional().describe("Optional small footer text, centered."),
  }),
]).describe("Email body. Provide as object {heading, paragraphs, cta, footer} for rich layout, or plain string as fallback.");

// Convert either body shape to a Craft email doc (new editor format).
function bodyToCraft(body: string | RichEmailBody): string {
  return typeof body === "string" ? textToCraftDoc(body) : richBodyToCraftDoc(body);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

// Best-effort extract of heading/paragraphs/CTA/footer from an email body so
// get_broadcast_details lets AI SEE existing content before update_broadcast
// (a full rewrite). Handles the new Craft format; falls back to legacy maily.
// Output shape mirrors RichEmailBody so AI can edit-and-pass-back.
function bodyToReadable(htmlBody: string): {
  heading: string | null;
  paragraphs: string[];
  cta: { text: string; url: string } | null;
  footer: string | null;
} {
  let doc: any;
  try { doc = JSON.parse(htmlBody); } catch { return { heading: null, paragraphs: [], cta: null, footer: null }; }
  const out = { heading: null as string | null, paragraphs: [] as string[], cta: null as any, footer: null as string | null };
  const stripHtml = (h: string) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

  // New Craft format — ROOT + resolvedName nodes (insertion order preserved).
  if (doc?.ROOT) {
    for (const k of Object.keys(doc)) {
      const n = doc[k];
      const rn = n?.type?.resolvedName;
      const props = n?.props ?? {};
      if (rn === "EmailHeading") out.heading = stripHtml(props.text);
      else if (rn === "EmailButton") out.cta = { text: props.text ?? "", url: props.href ?? "" };
      else if (rn === "EmailText") {
        const t = stripHtml(props.text);
        if (!t) continue;
        if (props.align === "center" && (Number(props.fontSize) || 14) <= 12) out.footer = t;
        else out.paragraphs.push(t);
      }
    }
    return out;
  }

  // Legacy maily fallback.
  const flat = (n: any): string => {
    if (!n) return "";
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.content)) return n.content.map(flat).join("");
    return "";
  };
  for (const block of doc?.content ?? []) {
    if (block.type === "heading") out.heading = flat(block).trim();
    else if (block.type === "paragraph") {
      const t = flat(block).trim();
      if (t) out.paragraphs.push(t);
    } else if (block.type === "button") {
      out.cta = { text: block.attrs?.text ?? "", url: block.attrs?.url ?? "" };
    } else if (block.type === "footer") {
      out.footer = flat(block).trim();
    }
  }
  return out;
}

const listBroadcasts = defineTool({
  name: "list_broadcasts",
  description: "List recent email broadcasts with their status and stats.",
  inputSchema: z.object({
    status: z.enum(["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELED"]).optional(),
    limit:  z.number().int().min(1).max(30).default(10),
  }),
  requiresConfirm: false,
  requiredPermission: "broadcasts:read",
  execute: async ({ status, limit }, ctx) => {
    const broadcasts = await db.broadcast.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status && { status }) },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true, name: true, subject: true, status: true,
        scheduledAt: true, sentAt: true,
        totalRecipients: true, sentCount: true, failedCount: true,
      },
    });
    return {
      count: broadcasts.length,
      broadcasts: broadcasts.map((b) => ({
        id: b.id,
        name: b.name,
        subject: b.subject,
        status: b.status,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        sentAt: b.sentAt?.toISOString() ?? null,
        recipients: b.totalRecipients,
        sent: b.sentCount,
        failed: b.failedCount,
      })),
    };
  },
});

const getBroadcastDetails = defineTool({
  name: "get_broadcast_details",
  description:
    "Get full details of a single broadcast — name, subject, audience, schedule, AND parsed body content (heading, paragraphs, CTA, footer). " +
    "Use BEFORE update_broadcast to see existing content, since update_broadcast REPLACES the body entirely. Without this, you'd accidentally wipe the user's content.",
  inputSchema: z.object({
    broadcastId: z.string().describe("Use list_broadcasts to find."),
  }),
  requiresConfirm: false,
  requiredPermission: "broadcasts:read",
  execute: async ({ broadcastId }, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: broadcastId, workspaceId: ctx.workspaceId },
      select: {
        id: true, name: true, subject: true, status: true,
        scheduledAt: true, sentAt: true,
        fromName: true, fromEmail: true,
        targetType: true, targetTagIds: true, excludeUnsubscribed: true,
        totalRecipients: true, sentCount: true, failedCount: true,
        htmlBody: true,
      },
    });
    if (!b) return { error: "Broadcast not found" };

    // Resolve tag names for TAG audience so AI can refer to them by name
    const tagNames = b.targetType === "TAG" && b.targetTagIds.length > 0
      ? (await db.tag.findMany({
          where: { id: { in: b.targetTagIds }, workspaceId: ctx.workspaceId },
          select: { name: true },
        })).map((t) => t.name)
      : [];

    return {
      id: b.id,
      name: b.name,
      subject: b.subject,
      status: b.status,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      sentAt: b.sentAt?.toISOString() ?? null,
      from: `${b.fromName} <${b.fromEmail}>`,
      audience: {
        type: b.targetType,
        tagNames,
        excludeUnsubscribed: b.excludeUnsubscribed,
      },
      stats: { recipients: b.totalRecipients, sent: b.sentCount, failed: b.failedCount },
      body: bodyToReadable(b.htmlBody),
    };
  },
});

// ─── Writes ─────────────────────────────────────────────────────────────────

const createBroadcastFromSpec = defineTool({
  name: "create_broadcast_from_spec",
  description:
    "Create a one-off email broadcast (newsletter blast, promo, announcement). " +
    "Body is structured (heading + paragraphs + optional CTA button + footer) so the email looks polished, not bare text. " +
    "Use scheduledAt for future sends (must be ≥10 minutes in the future). Omit scheduledAt to leave as DRAFT.",
  inputSchema: z.object({
    name:    z.string().min(1).describe("Internal name for the broadcast (not shown to recipients)."),
    subject: z.string().min(1).describe("Email subject line. Keep punchy — first 50 chars matter most for opens."),
    body:    richBodySchema,
    audience: z.object({
      type: z.enum(["ALL_CONTACTS", "TAG"]).default("ALL_CONTACTS").describe("ALL_CONTACTS = entire workspace. TAG = only contacts with specified tags."),
      tagNames: z.array(z.string()).optional().describe("Required if type=TAG. Auto-created if missing."),
      excludeUnsubscribed: z.boolean().default(true).describe("Skip contacts who unsubscribed (recommended)."),
    }),
    scheduledAt: z.string().datetime().optional().describe("ISO 8601 datetime. Must be ≥10 minutes in future. Omit for DRAFT (operator schedules later)."),
  }),
  requiresConfirm: true,
  requiredPermission: "broadcasts:write",
  summary: (a) => {
    const aud = a.audience.type === "ALL_CONTACTS"
      ? "all contacts"
      : `tag(s) ${(a.audience.tagNames ?? []).map((t) => `"${t}"`).join(", ")}`;
    const when = a.scheduledAt ? `scheduled for ${new Date(a.scheduledAt).toLocaleString()}` : "as DRAFT";
    return `Create broadcast "${a.name}" → ${aud}, ${when}`;
  },
  execute: async (args, ctx) => {
    const sender = await getDefaultSender(ctx);

    // Graceful skip: tag names that don't exist + user lacks tags:write
    // are dropped from the audience list. If ZERO tags resolve, we throw —
    // a TAG broadcast with empty audience is meaningless. If at least one
    // resolves, the broadcast goes out to that subset and we report the
    // skipped tags in the result.
    const targetTagIds: string[] = [];
    const skippedTags:  string[] = [];
    if (args.audience.type === "TAG") {
      for (const tagName of args.audience.tagNames ?? []) {
        const id = await findOrSkipTag(tagName, ctx);
        if (id) targetTagIds.push(id);
        else    skippedTags.push(tagName.trim());
      }
      if (targetTagIds.length === 0) {
        throw new Error(
          skippedTags.length > 0
            ? `TAG audience requires at least one tag that exists. All requested tags (${skippedTags.join(", ")}) don't exist yet, and the user lacks "tags:write" to create them. Suggest list_tags to pick from existing ones.`
            : "TAG audience requires at least one tag",
        );
      }
    }

    // Validate scheduledAt + SMTP BEFORE creating row, so we don't leave
    // orphan SCHEDULED rows when the queue enqueue fails.
    let scheduledAt: Date | null = null;
    let status: "DRAFT" | "SCHEDULED" = "DRAFT";
    let scheduleBumped = false;
    if (args.scheduledAt) {
      const requested = new Date(args.scheduledAt);
      const resolved = resolveScheduledAt(requested, new Date());
      scheduledAt = resolved.final;
      scheduleBumped = resolved.bumped;
      status = "SCHEDULED";
      await ensureSmtpConfigured(ctx.workspaceId);
    }

    const broadcast = await db.broadcast.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: args.name,
        subject: args.subject,
        htmlBody: bodyToCraft(args.body),
        fromName: sender.name,
        fromEmail: sender.email,
        status,
        scheduledAt,
        targetType: args.audience.type,
        targetTagIds,
        excludeUnsubscribed: args.audience.excludeUnsubscribed ?? true,
      },
    });

    // Enqueue dispatch job AFTER row exists. If this fails the row stays as
    // SCHEDULED in DB but no job — operator can re-trigger Send in UI.
    if (status === "SCHEDULED" && scheduledAt) {
      await scheduleBroadcastDispatch({
        broadcastId: broadcast.id,
        workspaceId: ctx.workspaceId,
        scheduledAt,
      });
    }

    return {
      broadcastId: broadcast.id,
      name: broadcast.name,
      status: broadcast.status,
      scheduledAt: scheduledAt?.toISOString() ?? null,
      scheduleBumped,
      skipped: { tags: skippedTags },
      message: status === "SCHEDULED"
        ? `Broadcast SCHEDULED${scheduleBumped ? " (bumped to ~11 min from now to satisfy minimum lead time)" : ""}. [Open in editor](/${ctx.workspaceSlug}/emails/broadcasts/${broadcast.id}) if you want to review.`
        : `Broadcast saved as DRAFT. [Open in editor](/${ctx.workspaceSlug}/emails/broadcasts/${broadcast.id}) to review and schedule.`,
    };
  },
});

const updateBroadcast = defineTool({
  name: "update_broadcast",
  description:
    "Update fields on an existing broadcast. Allowed when status = DRAFT or SCHEDULED (locked once SENDING/SENT/CANCELED/FAILED). " +
    "Body update REPLACES the existing content (full rewrite). " +
    "Pass scheduledAt to (re-)schedule: the prior queued job is removed and a new one enqueued. Must be ≥10 minutes in the future.",
  inputSchema: z.object({
    broadcastId: z.string().describe("Use list_broadcasts to find."),
    name:        z.string().optional(),
    subject:     z.string().optional(),
    body:        richBodySchema.optional().describe("Replaces existing body entirely. Provide all paragraphs you want — old content is wiped."),
    scheduledAt: z.string().datetime().optional().describe("ISO 8601 UTC. Must be ≥10 min in future. Promotes DRAFT → SCHEDULED (or reschedules a SCHEDULED broadcast)."),
  }),
  requiresConfirm: true,
  requiredPermission: "broadcasts:write",
  summary: async (a, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: a.broadcastId, workspaceId: ctx.workspaceId },
      select: { name: true, status: true },
    });
    if (!b) return `Update broadcast ${a.broadcastId}`;
    const fields = [
      a.name && "name",
      a.subject && "subject",
      a.body && "body",
      a.scheduledAt && `schedule → ${new Date(a.scheduledAt).toLocaleString()}`,
    ].filter(Boolean).join(", ");
    return `Update broadcast "${b.name}" (${fields || "no fields"})`;
  },
  execute: async (args, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: args.broadcastId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!b) throw new Error("Broadcast not found");
    if (b.status !== "DRAFT" && b.status !== "SCHEDULED") {
      throw new Error(`Cannot edit broadcast with status ${b.status}.`);
    }

    const data: Record<string, unknown> = {};
    if (args.name)    data.name = args.name;
    if (args.subject) data.subject = args.subject;
    if (args.body)    data.htmlBody = bodyToCraft(args.body);

    // Reschedule: validate + check SMTP BEFORE writing DB. Auto-bump if
    // requested time is within MIN_LEAD_TIME (consistent with create flow).
    let newScheduledAt: Date | null = null;
    let scheduleBumped = false;
    if (args.scheduledAt) {
      const requested = new Date(args.scheduledAt);
      const resolved = resolveScheduledAt(requested, new Date());
      newScheduledAt = resolved.final;
      scheduleBumped = resolved.bumped;
      await ensureSmtpConfigured(ctx.workspaceId);
      data.scheduledAt = newScheduledAt;
      data.status = "SCHEDULED";
    }

    const updated = await db.broadcast.update({ where: { id: b.id }, data });

    if (newScheduledAt) {
      await scheduleBroadcastDispatch({
        broadcastId: updated.id,
        workspaceId: ctx.workspaceId,
        scheduledAt: newScheduledAt,
      });
    }

    return {
      broadcastId: updated.id,
      name: updated.name,
      updatedFields: Object.keys(data),
      scheduledAt: newScheduledAt?.toISOString() ?? null,
      scheduleBumped,
      message: newScheduledAt
        ? `Broadcast updated and rescheduled${scheduleBumped ? " (bumped to ~11 min from now to satisfy minimum lead time)" : ""}. [Open in editor](/${ctx.workspaceSlug}/emails/broadcasts/${updated.id})`
        : `Broadcast updated. [Open in editor](/${ctx.workspaceSlug}/emails/broadcasts/${updated.id})`,
    };
  },
});

const cancelBroadcast = defineTool({
  name: "cancel_broadcast",
  description: "Cancel a SCHEDULED broadcast and return it to DRAFT (so operator can edit and re-schedule). For SENT broadcasts, this does nothing.",
  inputSchema: z.object({
    broadcastId: z.string(),
  }),
  requiresConfirm: true,
  requiredPermission: "broadcasts:write",
  summary: async (a, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: a.broadcastId, workspaceId: ctx.workspaceId },
      select: { name: true, status: true },
    });
    if (!b) return `Cancel broadcast ${a.broadcastId}`;
    return `Cancel broadcast "${b.name}" (return to DRAFT)`;
  },
  execute: async (args, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: args.broadcastId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!b) throw new Error("Broadcast not found");
    if (b.status !== "SCHEDULED") {
      throw new Error(`Cannot cancel broadcast with status ${b.status}. Only SCHEDULED broadcasts can be canceled.`);
    }
    // Remove the queued dispatch job FIRST. If we update DB first then queue
    // remove fails, the broadcast still fires from queue but DB says DRAFT
    // — confusing inconsistency. Try queue remove first; if it fails, the
    // job-id-based remove is idempotent and the worker will skip if it sees
    // status != SCHEDULED at fire time anyway.
    try { await broadcastQueue().remove(dispatchJobId(b.id)); } catch {}

    const updated = await db.broadcast.update({
      where: { id: b.id },
      data: { status: "DRAFT", scheduledAt: null },
    });
    return { broadcastId: updated.id, name: updated.name, newStatus: "DRAFT" };
  },
});

const deleteBroadcast = defineTool({
  name: "delete_broadcast",
  description:
    "Permanently delete a broadcast. Allowed only for DRAFT, SCHEDULED, CANCELED, or FAILED status. " +
    "Cannot delete SENDING (in progress) or SENT (preserve audit log). " +
    "If SCHEDULED, the queued dispatch job is removed first.",
  inputSchema: z.object({
    broadcastId: z.string().describe("Broadcast ID from list_broadcasts."),
  }),
  requiresConfirm: true,
  requiredPermission: "broadcasts:delete",
  summary: async (a, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: a.broadcastId, workspaceId: ctx.workspaceId },
      select: { name: true, status: true },
    });
    if (!b) return `Delete broadcast ${a.broadcastId}`;
    return `Delete broadcast "${b.name}" (status: ${b.status})`;
  },
  execute: async (args, ctx) => {
    const b = await db.broadcast.findFirst({
      where: { id: args.broadcastId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!b) throw new Error("Broadcast not found");
    if (b.status === "SENDING" || b.status === "SENT") {
      throw new Error(`Cannot delete broadcast with status ${b.status}. Sent broadcasts are preserved as an audit record.`);
    }

    // Best-effort: pull the queued dispatch job before deleting the row, so
    // the worker doesn't fire against a vanished ID. Failure is non-fatal —
    // worker re-checks status and skips if row is gone.
    if (b.status === "SCHEDULED") {
      try { await broadcastQueue().remove(dispatchJobId(b.id)); } catch {}
    }

    await db.broadcast.delete({ where: { id: b.id } });
    return { deleted: true, name: b.name };
  },
});

export const broadcastTools = [
  listBroadcasts,
  getBroadcastDetails,
  createBroadcastFromSpec,
  updateBroadcast,
  cancelBroadcast,
  deleteBroadcast,
];
