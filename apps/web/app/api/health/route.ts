// Liveness + readiness probe. Returns 200 once Next.js is up and Postgres
// is reachable. Used by:
//   - install.sh / update.sh wait loops
//   - Docker healthcheck directives (if added)
//   - Marketplace platforms / k8s health probes

import { db } from "@launchtic/database";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { status: "error", error: e?.message ?? "db unreachable" },
      { status: 503 },
    );
  }
}
