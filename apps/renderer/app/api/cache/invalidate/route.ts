import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";

// POST /api/cache/invalidate
// Called by apps/web after publishing a page
export async function POST(req: NextRequest) {
  try {
    const { domain, slug } = await req.json();

    if (!domain || !slug) {
      return NextResponse.json({ success: false, error: "domain and slug required" }, { status: 400 });
    }

    const cacheKey = `page:${domain}:${slug}`;
    await redis.del(cacheKey);

    return NextResponse.json({ success: true, invalidated: cacheKey });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
