// Edge-safe auth: instantiate NextAuth with the lite config (no Prisma,
// no bcrypt, no Node-only deps). Middleware only needs to verify existing
// JWT sessions — it never logs users in. Full auth (with Credentials +
// bcrypt + Prisma) lives in lib/auth.ts and is used by API routes.
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const handleI18nRouting = createMiddleware(routing);

const protectedPaths = [
  "/dashboard",
  "/editor",
  "/funnels",
  "/contacts",
  "/emails",
  "/automations",
  "/settings",
  "/orders",
  "/subscriptions",
  "/transactions",
  "/coupons",
  "/physical-products",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Strip locale prefix to get the actual path for auth checks
  const localePattern = new RegExp(`^/(${routing.locales.join("|")})`);
  const pathWithoutLocale = pathname.replace(localePattern, "") || "/";

  const isProtected = protectedPaths.some((p) =>
    pathWithoutLocale.startsWith(p)
  );
  const isAuthPage =
    pathWithoutLocale === "/login" || pathWithoutLocale === "/register";

  if (!req.auth && isProtected) {
    const locale = pathname.match(localePattern)?.[1] ?? routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && isAuthPage) {
    const locale = pathname.match(localePattern)?.[1] ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/funnels`, req.nextUrl));
  }

  return handleI18nRouting(req);
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and API routes
    "/((?!_next|api|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
