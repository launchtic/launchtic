// Edge-safe NextAuth config — used by middleware.ts (which runs on the Edge
// Runtime). MUST NOT import:
//   - Prisma client (uses Node.js APIs not available on Edge)
//   - bcryptjs (uses crypto + setImmediate)
//   - jsonwebtoken / jose Node bindings (use webapi-only path)
//
// The full config (with Credentials provider doing DB + bcrypt) lives in
// auth.ts and is composed via `{ ...authConfig, providers: [...] }`. The two
// files share session strategy + pages + JWT/session callbacks (which only
// shuffle data already in the token — no I/O).

import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  // Trust the X-Forwarded-Host header from the Caddy reverse proxy so that
  // NextAuth redirects use the public hostname (e.g. app.example.com) instead
  // of the internal listen address (0.0.0.0:3000).
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  // Empty here — providers are added in auth.ts (Node-only Credentials with
  // bcrypt + Prisma). Middleware doesn't need to authorize new sessions, only
  // verify existing JWTs, so an empty providers array is correct on the Edge.
  providers: [],
  callbacks: {
    // Session stores ONLY the user identity. Workspace context (workspaceId,
    // slug, plan, role) is no longer stamped onto the session — it's derived
    // per-request from the URL (`X-Workspace-Slug` header for APIs, the URL
    // param for server pages). This keeps multi-tab + multi-workspace clean:
    // a session can't drift from the URL because there's no session workspace
    // state to drift.
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
};
