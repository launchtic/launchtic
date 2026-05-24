-- AddColumn
ALTER TABLE "Organization" ADD COLUMN "storage" JSONB;

-- Backfill: for each Organization that has any workspace with a storage
-- config, copy the FIRST such workspace's config up to the org. We pick the
-- oldest workspace deterministically (createdAt asc) so re-runs are stable.
-- Workspaces sharing the same org but configured differently will collapse
-- to the first one — uncommon (the per-workspace UI was rare to use).
WITH first_storage AS (
  SELECT DISTINCT ON (w."organizationId")
    w."organizationId" AS org_id,
    ws."storage"        AS storage_json
  FROM   "Workspace" w
  JOIN   "WorkspaceSettings" ws ON ws."workspaceId" = w.id
  WHERE  ws."storage" IS NOT NULL
  ORDER  BY w."organizationId", w."createdAt" ASC
)
UPDATE "Organization" o
SET    "storage" = fs.storage_json
FROM   first_storage fs
WHERE  o.id = fs.org_id;
