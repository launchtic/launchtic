-- Rename the legacy automations:* role permissions to workflows:* and drop the
-- now-dead permission strings from every existing Role.permissions array.
--
-- Background: the Automation and Sequence features were removed (see migration
-- 20260602000000_drop_legacy_automation_sequence) and replaced by Workflows.
-- Workflows reused the automations:read / automations:write permission strings.
-- This migration makes the stored grants match the new naming so operators see
-- "Workflows" permissions that actually gate the Workflows feature.
--
-- Role.permissions is a Postgres text[] — array_replace swaps a value in place,
-- array_remove drops it. No duplicate risk: workflows:* didn't exist before
-- this migration, so array_replace can't collide with a pre-existing value.

-- automations:read  → workflows:read
UPDATE "Role"
  SET "permissions" = array_replace("permissions", 'automations:read', 'workflows:read')
  WHERE 'automations:read' = ANY("permissions");

-- automations:write → workflows:write
UPDATE "Role"
  SET "permissions" = array_replace("permissions", 'automations:write', 'workflows:write')
  WHERE 'automations:write' = ANY("permissions");

-- Drop dead permissions (no route/UI enforces these anymore):
--   automations:delete — workflow delete uses workflows:write
--   sequences:*        — Sequence feature removed
UPDATE "Role"
  SET "permissions" = array_remove("permissions", 'automations:delete')
  WHERE 'automations:delete' = ANY("permissions");

UPDATE "Role"
  SET "permissions" = array_remove("permissions", 'sequences:read')
  WHERE 'sequences:read' = ANY("permissions");

UPDATE "Role"
  SET "permissions" = array_remove("permissions", 'sequences:write')
  WHERE 'sequences:write' = ANY("permissions");

UPDATE "Role"
  SET "permissions" = array_remove("permissions", 'sequences:delete')
  WHERE 'sequences:delete' = ANY("permissions");
