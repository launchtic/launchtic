// Edge-safe auth: instantiate NextAuth with the lite config (no Prisma,
// no bcrypt, no Node-only deps). Middleware only needs to verify existing
// JWT sessions — it never logs users in. Full auth (with Credentials +
// bcrypt + Prisma) lives in lib/auth.ts and is used by API routes.
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isPublic = isAuthPage || pathname.startsWith("/api/") || pathname === "/";

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)" ],
};
