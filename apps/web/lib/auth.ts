// Full NextAuth setup — Node.js-only. Imports Prisma client + bcrypt for the
// Credentials provider's `authorize()` (login flow). Used by API routes,
// server components, and `signIn` / `signOut` triggers.
//
// The middleware (which runs on the Edge Runtime) does NOT import this file —
// it imports auth.config.ts instead, which is the same shape minus the
// Node-only Credentials provider. See apps/web/middleware.ts.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { z } from "zod";
import { authConfig } from "./auth.config";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Workspace data is no longer needed at login — fetched per-request
        // from URL in dashboard layout (see WorkspaceRoleProvider).
        const user = await db.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, avatar: true, passwordHash: true },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Workspace context (id/slug/name/plan/role) is no longer stamped on
        // the JWT — it's derived per-request from the URL. We just return the
        // user identity here; downstream code looks up workspace data fresh
        // each time (see requireWorkspaceFromSlug, WorkspaceRoleProvider).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
        };
      },
    }),
  ],
});
