import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const contactRowSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
});

const MAX_CONTACTS = 1000;
const CHUNK_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("contacts:import");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = await req.json();

    if (!Array.isArray(body)) return err("Request body must be an array", 400);
    if (body.length > MAX_CONTACTS) return err(`Maximum ${MAX_CONTACTS} contacts per import`, 400);

    let imported = 0;
    let skipped = 0;
    const errors: { index: number; email?: string; reason: string }[] = [];

    const validated: { index: number; data: z.infer<typeof contactRowSchema> }[] = [];

    for (let i = 0; i < body.length; i++) {
      const result = contactRowSchema.safeParse(body[i]);
      if (!result.success) {
        errors.push({ index: i, email: body[i]?.email, reason: result.error.errors.map((e) => e.message).join(", ") });
      } else {
        validated.push({ index: i, data: result.data });
      }
    }

    const chunks: typeof validated[] = [];
    for (let i = 0; i < validated.length; i += CHUNK_SIZE) {
      chunks.push(validated.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async ({ index, data }) => {
          try {
            const existing = await db.contact.findUnique({
              where: { workspaceId_email: { workspaceId, email: data.email } },
              select: { id: true },
            });

            await db.contact.upsert({
              where: { workspaceId_email: { workspaceId, email: data.email } },
              update: {
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
                country: data.country,
              },
              create: { ...data, workspaceId },
            });

            return { status: existing ? "skipped" : "imported", index, email: data.email } as const;
          } catch (e) {
            const reason = e instanceof Error ? e.message : "Unknown error";
            return { status: "error", index, email: data.email, reason } as const;
          }
        })
      );

      for (const result of results) {
        if (result.status === "imported") imported++;
        else if (result.status === "skipped") skipped++;
        else errors.push({ index: result.index, email: result.email as string, reason: result.reason! });
      }
    }

    return ok({ imported, skipped, errors, total: body.length });
  } catch (error) {
    return handleError(error);
  }
}
