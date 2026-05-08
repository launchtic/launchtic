import { NextRequest } from "next/server";
import { db } from "@launchtic/database";

// Caddy calls this endpoint before issuing an SSL cert for a custom domain
// Returns 200 only if the domain is verified — prevents abuse of Let's Encrypt rate limits
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return new Response("missing domain", { status: 400 });

  const record = await db.domain.findUnique({
    where: { domain, verified: true },
    select: { id: true },
  });

  return record
    ? new Response("ok", { status: 200 })
    : new Response("not found", { status: 404 });
}
