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
  pages: {
    signIn: "/login",
  },
  // Empty here — providers are added in auth.ts (Node-only Credentials with
  // bcrypt + Prisma). Middleware doesn't need to authorize new sessions, only
  // verify existing JWTs, so an empty providers array is correct on the Edge.
  providers: [],
  callbacks: {
    // Attach extra data to the JWT token. Pure data shuffling — no I/O,
    // safe to run on Edge or Node.
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.workspaceId = (user as any).workspaceId;
        token.workspaceName = (user as any).workspaceName;
        token.workspacePlan = (user as any).workspacePlan;
      }
      return token;
    },
    // Mirror token data onto the session object exposed to UI / API code.
    async session({ session, token }) {
      session.user.id = token.userId as string;
      (session as any).workspaceId = token.workspaceId;
      (session as any).workspaceName = token.workspaceName;
      (session as any).workspacePlan = token.workspacePlan;
      return session;
    },
  },
};
