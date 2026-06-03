// Identity cookie helper — `lt_contact` is the cross-page identity used by
// the PAGE_VISITED trigger. It's set whenever the renderer learns a
// visitor's contactId through any first-party identification point:
//
//   • Email link click  → /api/email/track/click/[token]
//   • Form opt-in       → /api/submit         (optin branch)
//   • Checkout intent   → /api/checkout/intent
//   • Checkout confirm  → /api/checkout/confirm  (defensive — already
//                         set at intent, but a returning customer may
//                         hit confirm without intent in some PayPal flows)
//
// 30-day window matches the typical cart-abandonment + nurture horizon.
// HttpOnly: client JS can't read or exfiltrate it (XSS hardening).
// SameSite Lax: allows the cookie on top-level navigations (e.g. opening
// the funnel page from a fresh tab) while blocking it on third-party
// iframe contexts.

import type { NextResponse } from "next/server";

const COOKIE_NAME = "lt_contact";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function setLtContactCookie(res: NextResponse, contactId: string | null | undefined): NextResponse {
  if (!contactId) return res;
  res.cookies.set(COOKIE_NAME, contactId, {
    path:     "/",
    maxAge:   MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
  });
  return res;
}
