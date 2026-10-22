-- The AI now reads a summary from pageJson instead of hand-written tags /
-- descriptions (apps/web/lib/page-templates/summarize.ts).
ALTER TABLE "PageTemplate" DROP COLUMN "description";
ALTER TABLE "PageTemplate" DROP COLUMN "tags";
