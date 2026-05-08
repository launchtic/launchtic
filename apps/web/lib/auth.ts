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

        const user = await db.user.findUnique({
          where: { email },
          include: {
            ownedWorkspaces: {
              select: { id: true, name: true, slug: true, plan: true },
              take: 1,
            },
          },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        const workspace = user.ownedWorkspaces[0] ?? null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          workspaceId: workspace?.id ?? null,
          workspaceName: workspace?.name ?? null,
          workspacePlan: workspace?.plan ?? null,
        };
      },
    }),
  ],
});
