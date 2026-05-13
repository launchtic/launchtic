import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { encrypt, decrypt } from "../../../../lib/crypto";

const KEEP = "__KEEP__";

const bodySchema = z.object({
  driver:    z.enum(["local", "s3"]),
  endpoint:  z.string().optional(),
  region:    z.string().optional(),
  bucket:    z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  publicUrl: z.string().optional(),
});

export async function GET() {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const s = settings?.storage as any;

    return ok({
      driver:    s?.driver    ?? "local",
      endpoint:  s?.endpoint  ?? "",
      region:    s?.region    ?? "",
      bucket:    s?.bucket    ?? "",
      accessKey: s?.accessKey ?? "",
      secretKey: s?.secretKeyEnc ? maskKey(safeDecrypt(s.secretKeyEnc)) : "",
      publicUrl: s?.publicUrl ?? "",
    });
  } catch (error) {
    console.error(error);
    return err("Failed to load storage config", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = bodySchema.parse(await req.json());

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const existing = settings?.storage as any;

    let secretKeyEnc: string | null = existing?.secretKeyEnc ?? null;
    if (body.secretKey && body.secretKey !== KEEP) {
      secretKeyEnc = encrypt(body.secretKey);
    }

    const storageData = {
      driver:      body.driver,
      endpoint:    body.endpoint  || null,
      region:      body.region    || null,
      bucket:      body.bucket    || null,
      accessKey:   body.accessKey || null,
      secretKeyEnc,
      publicUrl:   body.publicUrl || null,
    };

    await db.workspaceSettings.upsert({
      where:  { workspaceId },
      create: { workspaceId, storage: storageData },
      update: { storage: storageData },
    });

    return ok({ driver: body.driver });
  } catch (error) {
    console.error(error);
    return err("Failed to save storage config", 500);
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 8) + "••••••••" + key.slice(-4);
}

function safeDecrypt(enc: string): string {
  try { return decrypt(enc); } catch { return ""; }
}
