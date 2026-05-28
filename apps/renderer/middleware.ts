import { NextRequest, NextResponse } from "next/server";

// Ensures every visitor has a stable `lt_sid` cookie so we can stitch their
// journey across funnel steps (and attribute A/B variants later). The value is
// also forwarded on the `x-lt-sid` request header so the SAME request's server
// code (page RSC + /api handlers) reads a consistent id — a cookie set on the
// response isn't visible to cookies() within the same render.

const SID_COOKIE = "lt_sid";
const SID_HEADER = "x-lt-sid";
const ONE_YEAR   = 60 * 60 * 24 * 365;

export function middleware(req: NextRequest) {
  let sid = req.cookies.get(SID_COOKIE)?.value;
  const isNew = !sid;
  if (!sid) sid = crypto.randomUUID();

  // Forward the id into the request so server components / route handlers on
  // THIS request can read it via headers().get("x-lt-sid").
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(SID_HEADER, sid);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Persist for future requests. httpOnly — the visitor never needs JS access.
  if (isNew) {
    res.cookies.set(SID_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: ONE_YEAR,
      path: "/",
    });
  }
  return res;
}

export const config = {
  // Run on page + api routes; skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
