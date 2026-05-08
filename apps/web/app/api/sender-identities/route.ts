import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../lib/api";

const createSchema = z.object({
  name:      z.string().min(1).max(120),
  email:     z.string().email(),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const identities = await db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return ok(identities);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const data = createSchema.parse(await req.json());

    // If creating with isDefault=true OR this is the first identity in the
    // workspace, unset any other defaults to maintain "exactly one default".
    const count = await db.senderIdentity.count({ where: { workspaceId } });
    const shouldDefault = data.isDefault || count === 0;

    const identity = await db.$transaction(async (tx) => {
      if (shouldDefault) {
        await tx.senderIdentity.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.senderIdentity.create({
        data: {
          workspaceId,
          name:      data.name,
          email:     data.email,
          isDefault: shouldDefault,
        },
      });
    });

    return ok(identity, 201);
  } catch (error) {
    return handleError(error, { "workspaceId,email": "An identity with this email already exists." });
  }
}
