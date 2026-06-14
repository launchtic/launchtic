import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { maskInDemo } from "../../../../lib/demo";

const KEEP = "__KEEP__";

const schema = z.object({
  provider:      z.enum(["SES", "SENDGRID", "MAILGUN", "POSTMARK", "CUSTOM"]),
  host:          z.string().min(1),
  port:          z.number().int().min(1).max(65535),
  username:      z.string().min(1),
  password:      z.string().min(1),
  maxPerDay:     z.number().int().min(1).default(10000),
  maxPerSecond:  z.number().int().min(1).default(1),
  maxConcurrent: z.number().int().min(1).default(1),
});

export async function GET() {
  try {
    const r = await requireAccess("settings:email:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = settings?.smtp as any;
    if (!smtp) return ok(null);

    return ok({
      provider:      smtp.provider,
      host:          smtp.host,
      port:          smtp.port,
      username:      smtp.username,
      password:      maskInDemo(smtp.password ?? ""),
      maxPerDay:     smtp.maxPerDay     ?? 10000,
      maxPerSecond:  smtp.maxPerSecond  ?? 1,
      maxConcurrent: smtp.maxConcurrent ?? 1,
    });
  } catch (error) {
    console.error(error);
    return err("Failed to load SMTP config", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:email:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = schema.parse(await req.json());

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const existing = settings?.smtp as any;

    let password: string;
    if (body.password === KEEP) {
      if (!existing?.password) return err("No existing SMTP config to keep password from", 400);
      password = existing.password;
    } else {
      password = body.password;
    }

    const smtpData = {
      provider:      body.provider,
      host:          body.host,
      port:          body.port,
      username:      body.username,
      password,
      maxPerDay:     body.maxPerDay,
      maxPerSecond:  body.maxPerSecond,
      maxConcurrent: body.maxConcurrent,
    };

    await db.workspaceSettings.upsert({
      where:  { workspaceId },
      create: { workspaceId, smtp: smtpData },
      update: { smtp: smtpData },
    });

    return ok({ saved: true });
  } catch (error) {
    console.error(error);
    return err("Failed to save SMTP config", 500);
  }
}
