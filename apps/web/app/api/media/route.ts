import { NextRequest } from "next/server";
import { ok, err, getWorkspaceId } from "../../../lib/api";
import { getDriver } from "../../../lib/storage";

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder") ?? null;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const continuationToken = searchParams.get("continuation_token") ?? undefined;

    const prefix = folder ? `${workspaceId}/${folder}` : workspaceId;
    const driver = await getDriver(workspaceId);

    const [result, folders] = await Promise.all([
      driver.list(prefix, limit, continuationToken),
      folder ? Promise.resolve([]) : driver.listFolders(workspaceId),
    ]);

    return ok({
      files: result.files,
      hasMore: result.hasMore,
      nextToken: result.nextToken,
      total: result.total,
      folders,
    });
  } catch (error) {
    console.error("Media list error:", error);
    return err("Failed to list files", 500);
  }
}
