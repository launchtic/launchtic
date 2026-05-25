// Edge-safe auth: instantiate NextAuth with the lite config (no Prisma,
// no bcrypt, no Node-only deps). Middleware only needs to verify existing
// JWT sessions — it never logs users in. Full auth (with Credentials +
// bcrypt + Prisma) lives in lib/auth.ts and is used by API routes.
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// Pages that don't require an authenticated session — login + the
// pre-auth password reset flow. Authed users on /login get punted to
// /dashboard; on /forgot-password or /reset they're left alone (a
// logged-in user can still reset their password via the email link).
// /register is gone — first-run admin creation now lives in /setup.
const PRE_AUTH_PAGES = new Set(["/login", "/forgot-password", "/reset"]);
const LOGIN_REDIRECT_PAGES = new Set(["/login"]);

// Setup wizard cookie. Set by /api/setup/configure on completion. Middleware
// uses it as a fast-path to skip the first-run redirect; the wizard pages
// themselves double-check the SystemConfig table (anti-replay) so a cleared
// cookie just causes a /setup → /login redirect, not an infinite loop.
const SETUP_COOKIE = "lt_setup_done";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ── First-run guard ────────────────────────────────────────────────────
  // Force users through the wizard when the setup cookie isn't set. Two
  // escape hatches so we don't trap users in a redirect loop when the cookie
  // is missing for non-first-run reasons (cleared cache, 1y expiry, new
  // browser, incognito):
  //
  //   1. Whitelist /login + /api/auth/* — /login's server component does
  //      its own DB check (`userCount === 0 ? redirect("/setup")`) and is
  //      the authoritative "do I need to set up?" gate. Letting it through
  //      breaks the loop when /setup sees isSetupComplete=true and bounces
  //      back to /login.
  //
   //  2. req.auth bypass — if the user already has a valid session, setup
  //      MUST have been done (the founder account exists). Skip the cookie
  //      check entirely so a cleared-cookie user can keep working.
  const isSetupRoute =
    pathname.startsWith("/setup")    ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/auth")  ||
    pathname === "/login"             ||
    pathname === "/api/health";
  if (!req.cookies.get(SETUP_COOKIE) && !req.auth && !isSetupRoute) {
    return NextResponse.redirect(new URL("/setup", req.nextUrl));
  }

  const isPreAuthPage = PRE_AUTH_PAGES.has(pathname);
  const isPublic = isPreAuthPage || pathname.startsWith("/api/") || pathname === "/" || pathname.startsWith("/setup");

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && LOGIN_REDIRECT_PAGES.has(pathname)) {
    // Authed user on /login — punt to /dashboard, which is a server
    // component that resolves the user's default workspace from DB and
    // 302s to /{slug}/dashboard. Middleware is edge-runtime and can't
    // hit Prisma directly, so this 2-hop pattern keeps things simple.
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)" ],
};
