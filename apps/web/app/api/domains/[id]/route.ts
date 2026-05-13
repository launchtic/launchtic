import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { requireAccess } from "../../../../lib/permissions";
import dns from "dns/promises";

type Params = { params: Promise<{ id: string }> };

const PAGES_DOMAIN = process.env.PAGES_DOMAIN ?? "";

export async function DELETE(_req: NextRequest, { params }: Params) {
  const r = await requireAccess("settings:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { id } = await params;
  const domain = await db.domain.findUnique({ where: { id } });
  if (!domain || domain.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (domain.isDefault) {
    return NextResponse.json(
      { error: "Cannot delete the default domain. Promote another domain to default first." },
      { status: 400 },
    );
  }

  await db.domain.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

// Verify domain: check that CNAME points correctly to PAGES_DOMAIN
export async function PATCH(_req: NextRequest, { params }: Params) {
  const r = await requireAccess("settings:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { id } = await params;
  const record = await db.domain.findUnique({ where: { id } });
  if (!record || record.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Local/dev: skip real DNS check
  const isDev = process.env.NODE_ENV === "development" || !PAGES_DOMAIN;
  if (!isDev) {
    try {
      const cnames = await dns.resolveCname(record.domain);
      const pointsCorrectly = cnames.some(
        (c) => c === PAGES_DOMAIN || c === `${PAGES_DOMAIN}.`
      );
      if (!pointsCorrectly) {
        return NextResponse.json(
          { error: `CNAME not pointing to ${PAGES_DOMAIN}. Found: ${cnames.join(", ")}` },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "DNS lookup failed. Make sure CNAME record exists and has propagated." },
        { status: 400 }
      );
    }
  }

  const updated = await db.domain.update({
    where: { id },
    data: { verified: true },
  });

  return NextResponse.json(updated);
}
