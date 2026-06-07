-- Add the new workflows:delete permission and preserve prior behavior.
--
-- Until now the workflow DELETE route was gated by workflows:write (formerly
-- automations:write), so any role with write could delete workflows. We've
-- split deletion into its own workflows:delete grant. To avoid silently
-- stripping delete capability from existing roles, grant workflows:delete to
-- every role that currently has workflows:write.
--
-- Idempotent: only appends when write is present and delete is absent.

UPDATE "Role"
  SET "permissions" = array_append("permissions", 'workflows:delete')
  WHERE 'workflows:write' = ANY("permissions")
    AND NOT ('workflows:delete' = ANY("permissions"));
