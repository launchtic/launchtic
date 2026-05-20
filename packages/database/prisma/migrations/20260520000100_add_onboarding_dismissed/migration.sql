-- Track whether the operator has dismissed the onboarding checklist on the
-- dashboard. Default false → checklist visible until either all items done
-- (auto-hide) or the user clicks dismiss.

ALTER TABLE "WorkspaceSettings"
  ADD COLUMN "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false;
