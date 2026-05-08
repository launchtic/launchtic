import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  workspaceName: z.string().min(1).max(100),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) return err("Email already in use.", 409);

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Generate unique workspace slug
    const baseSlug = slugify(data.workspaceName) || "workspace";
    let slug = baseSlug;
    let attempt = 0;
    while (await db.workspace.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
        },
      });

      await tx.workspace.create({
        data: {
          name: data.workspaceName,
          slug,
          ownerId: newUser.id,
          members: {
            create: {
              userId: newUser.id,
              role: "OWNER",
            },
          },
        },
      });

      return newUser;
    });

    return ok({ id: user.id, email: user.email, name: user.name }, 201);
  } catch (error) {
    return handleError(error);
  }
}
