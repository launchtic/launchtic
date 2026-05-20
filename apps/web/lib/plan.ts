// Plan helpers. Enum values == UI labels (no mapping layer):
//
//   COMMUNITY  — free self-host, $0
//   STARTER    — $299/yr     · removes branding, premium templates
//   AGENCY     — $1,499/yr   · multi-workspace, team, white-label
//   CUSTOM     — contact     · SSO, audit, SLA
//
// License key prefix → plan (verified on launchtic.com side):
//   LT-STR-* → STARTER
//   LT-AGY-* → AGENCY
//   LT-CUS-* → CUSTOM

export type Plan = "COMMUNITY" | "STARTER" | "AGENCY" | "CUSTOM";

const COLORS: Record<Plan, string> = {
  COMMUNITY: "bg-gray-100 text-gray-700",
  STARTER:   "bg-blue-100 text-blue-700",
  AGENCY:    "bg-purple-100 text-purple-700",
  CUSTOM:    "bg-amber-100 text-amber-700",
};

/** Tailwind classes for plan-tier badges. */
export function planColor(plan: string | null | undefined): string {
  if (!plan) return COLORS.COMMUNITY;
  return COLORS[plan as Plan] ?? COLORS.COMMUNITY;
}

/** Render-ready label. Title-case for the badge; enum is already SHOUTY. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "Community";
  const v = (plan as string).toUpperCase();
  return v.charAt(0) + v.slice(1).toLowerCase();
}

/** Any paid tier. Gates premium-template-gallery, badge-removal, etc. */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "STARTER" || plan === "AGENCY" || plan === "CUSTOM";
}

/** Agency tier or above. Gates multi-workspace, team, white-label, cloning. */
export function isAgencyPlan(plan: string | null | undefined): boolean {
  return plan === "AGENCY" || plan === "CUSTOM";
}

/** Custom (top) tier. Gates SSO, audit logs, custom SLA. */
export function isCustomPlan(plan: string | null | undefined): boolean {
  return plan === "CUSTOM";
}
