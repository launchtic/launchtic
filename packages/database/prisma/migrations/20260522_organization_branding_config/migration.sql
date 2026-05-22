-- White-label branding overrides for Agency/Custom tier organizations.
-- Nullable: COMMUNITY/STARTER orgs leave this NULL and render launchtic
-- defaults. Agencies populate via Settings → Branding (panel gated by
-- PLAN_FEATURES[plan].whiteLabel).
ALTER TABLE "Organization" ADD COLUMN "brandingConfig" JSONB;
