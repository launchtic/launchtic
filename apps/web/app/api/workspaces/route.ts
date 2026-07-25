import { NextRequest } from "next/server";
import { z } from "zod";
import { createWorkspace, EeError } from "@launchtic/ee";
import { ok, err, handleError, getUserId } from "../../../lib/api";
import { demoGuard } from "../../../lib/demo";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const userId = await getUserId();
    if (!userId) return err("Unauthorized", 401);

    const body = await req.json();
    const { name } = createSchema.parse(body);

    const workspace = await createWorkspace(userId, name);
    return ok(workspace, 201);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}
