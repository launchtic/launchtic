import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { redis } from "../../../lib/redis";
import { fireTrigger } from "../../../lib/automations";
import { recordFunnelEvent, SID_HEADER } from "../../../lib/funnel-events";
import { getAssignedVariantId } from "../../../lib/ab-testing";
import { setLtContactCookie } from "../../../lib/identity-cookie";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

// ─── Rate limit: max 5 submits per minute per IP ──────────────────────────────
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 60;

async function checkRateLimit(ip: string | null): Promise<boolean> {
  if (!ip) return true; // Don't block when IP is unavailable (dev / proxy issues)
  try {
    const key = `rl:submit:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_WINDOW_SECONDS);
    return count <= RATE_LIMIT;
  } catch (err) {
    console.error("[submit] rate limit check failed:", err);
    return true; // Fail open — Redis down shouldn't block legitimate users
  }
}

// ─── Map payload fields to Contact columns ───────────────────────────────────
function mapFields(fields: Record<string, string>) {
  return {
    email:         fields.email          || undefined,
    firstName:     fields.first_name     || undefined,
    lastName:      fields.last_name      || fields.surname || undefined,
    phone:         fields.phone_number   || undefined,
    country:       fields.country        || undefined,
    city:          fields.city           || undefined,
    postalCode:    fields.postal_code    || fields.postcode || undefined,
    streetAddress: fields.street_address || undefined,
    streetNumber:  fields.street_number  || undefined,
    neighborhood:  fields.neighborhood   || undefined,
    state:         fields.state_province || undefined,
    company:       fields.company_name   || undefined,
    taxNumber:     fields.tax_number     || undefined,
  };
}

// ─── Find next published step in same funnel ──────────────────────────────────
async function getNextStepUrl(funnelStepId: string, host: string): Promise<string | null> {
  const current = await db.funnelStep.findUnique({
    where: { id: funnelStepId },
    select: { funnelId: true, order: true, funnel: { select: { workspaceId: true } } },
  });
  if (!current) return null;

  const next = await db.funnelStep.findFirst({
    where: {
      funnelId: current.funnelId,
      order: { gt: current.order },
    },
    orderBy: { order: "asc" },
    select: { slug: true },
  });

  if (!next) return null;

  const isDev = process.env.NODE_ENV === "development";
  const protocol = isDev || host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}/${next.slug}`;
}

// ─── Upsert contact + log event ───────────────────────────────────────────────
async function upsertContact(
  workspaceId: string,
  fields: Record<string, string | undefined>,
  funnelStepId: string,
  ip: string | null,
) {
  const email = fields.email;
  if (!email) throw new Error("email is required");

  const contactData = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")
  ) as Record<string, string>;

  // Subscription state lives on Contact (consentedAt + unsubscribedAt) — no
  // separate EmailSubscription model. On form submit we record consent and,
  // if the contact had previously unsubscribed, treat the new submit as
  // re-consent (clear unsubscribedAt).
  const now = new Date();
  const contact = await db.contact.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    update: {
      ...contactData,
      consentedAt: now,
      consentSource: "form",
      unsubscribedAt: null,
    },
    create: {
      workspaceId,
      email,
      ...contactData,
      consentedAt: now,
      consentSource: "form",
    },
    select: { id: true },
  });

  // Log FORM_SUBMIT event
  // Dedupe FORM_SUBMIT events: skip if the same (contact, funnelStep) was
  // logged in the last 60 seconds. Avoids automation triggers / event log
  // duplication when the user double-submits or a network retry replays.
  const sixtySecondsAgo = new Date(Date.now() - 60_000);
  const recentEvent = await db.contactEvent.findFirst({
    where: {
      contactId: contact.id,
      type: "FORM_SUBMIT",
      createdAt: { gte: sixtySecondsAgo },
      data: { path: ["funnelStepId"], equals: funnelStepId },
    },
    select: { id: true },
  });

  if (!recentEvent) {
    await db.contactEvent.create({
      data: {
        contactId: contact.id,
        type: "FORM_SUBMIT",
        data: { funnelStepId },
        ip,
      },
    });
  }

  return { contact, isDuplicate: !!recentEvent };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    const host = req.headers.get("host") ?? "localhost:3001";

    // Rate limit by IP — applied to ALL submission types
    const allowed = await checkRateLimit(ip);
    if (!allowed) return fail("Too many requests, please try again in a minute", 429);

    // ── OPTIN ──────────────────────────────────────────────────────────────
    if (body.optin) {
      const { funnelStepId, fields, _hp } = body.optin as {
        funnelStepId: string;
        fields: Record<string, string>;
        _hp?: string;
      };

      // Honeypot: bots auto-fill all inputs incl. our hidden field. Reject
      // with a generic error so a bot can't tell what tripped it.
      if (_hp && _hp.trim() !== "") return fail("Invalid submission");

      if (!funnelStepId) return fail("funnelStepId is required");
      if (!fields?.email) return fail("email is required");

      const step = await db.funnelStep.findUnique({
        where: { id: funnelStepId },
        select: { funnelId: true, funnel: { select: { workspaceId: true } } },
      });
      if (!step) return fail("Funnel step not found", 404);

      const { workspaceId } = step.funnel;
      const mapped = mapFields(fields);

      const { contact, isDuplicate } = await upsertContact(workspaceId, mapped, funnelStepId, ip);
      const nextStepUrl = await getNextStepUrl(funnelStepId, host);

      // Fire FORM_SUBMIT automation trigger + LEAD analytics event only on the
      // first submit within the dedupe window — keeps both from firing 1000×
      // on spam / double-submit / retries.
      if (!isDuplicate) {
        fireTrigger(workspaceId, "FORM_SUBMIT", {
          contactId: contact.id,
          funnelId: step.funnelId,
          funnelStepId,
        }).catch(() => {});

        const sid = req.headers.get(SID_HEADER);
        await recordFunnelEvent({
          type:         "LEAD",
          funnelId:     step.funnelId,
          funnelStepId,
          contactId:    contact.id,
          sessionId:    sid,
          variantId:    await getAssignedVariantId(funnelStepId, sid),
          ip,
        });
      }

      // Set the lt_contact identity cookie so subsequent funnel page visits
      // fire PAGE_VISITED. Set on EVERY submit (not just the first) so a
      // returning lead within the dedupe window still re-establishes
      // identity if their cookie expired or was cleared.
      return setLtContactCookie(ok({ nextStepUrl }), contact.id);
    }

   
    return fail("Unknown request type", 400);
  } catch (error) {
    console.error("[/api/submit]", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return fail(message, 500);
  }
}
