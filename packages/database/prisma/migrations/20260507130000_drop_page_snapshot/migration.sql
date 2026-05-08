-- Drop PageSnapshot — renderer now reads FunnelStep.pageJson directly.
-- The DRAFT/PUBLISHED split is gone; users clone a step to safely edit
-- without affecting the live page.
DROP TABLE "PageSnapshot";
