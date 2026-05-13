import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../lib/permissions";
import { ensureDefaultDomain } from "../../../lib/domains/default-domain";

export async function GET() {
  const r = await requireAccess("settings:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  await ensureDefaultDomain(workspaceId);

  const domains = await db.domain.findMany({
    where: { workspaceId },
    // Default first, then by creation
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(domains);
}

export async function POST(req: NextRequest) {
  const r = await requireAccess("settings:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  // Normalize: strip protocol, trailing slash, port
  const normalized = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  const existing = await db.domain.findUnique({ where: { domain: normalized } });
  if (existing) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
  }

  const record = await db.domain.create({
    data: {
      workspaceId,
      domain: normalized,
      verified: false,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
