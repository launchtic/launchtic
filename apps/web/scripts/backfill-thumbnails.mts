// Generate media-library grid thumbnails for every Asset that has none yet.
// Optional: listing /api/media backfills lazily too; this just does it all now.
//
//   cd apps/web && pnpm dlx dotenv-cli -e ../../.env -- pnpm dlx tsx scripts/backfill-thumbnails.mts

import { db } from "@launchtic/database";
import { getDriver } from "../lib/storage";
import { ensureThumbnails } from "../lib/media/thumbnails";

const BATCH = 50;

const workspaces = await db.asset.groupBy({ by: ["workspaceId"], where: { thumbUrl: null }, _count: true });
for (const { workspaceId, _count } of workspaces) {
  console.log(`${workspaceId}: ${_count} assets without thumbnail`);
  const driver = await getDriver(workspaceId);
  let made = 0, cursor: string | undefined;
  for (;;) {
    const rows = await db.asset.findMany({
      // id > cursor (not Prisma's cursor+skip): processed rows leave the filter.
      where: { workspaceId, thumbUrl: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, storagePath: true, mimeType: true, url: true, thumbUrl: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (!rows.length) break;
    made += (await ensureThumbnails(driver, rows, BATCH)).size;
    cursor = rows[rows.length - 1].id;
    console.log(`  ${made} done`);
  }
}
await db.$disconnect();
