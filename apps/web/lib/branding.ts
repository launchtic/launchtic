// White-label branding overrides (Agency/Custom tier feature).
//
// Stored at Organization level (per-installation) because branding is an
// agency-wide concern, not per-workspace — the agency wants the same logo
// across all their clients, not different per workspace.
//
// READ behavior: always succeeds, falls back to launchtic defaults for any
// missing field. A downgraded plan still renders the agency's saved overrides
// (so a client mid-session doesn't suddenly see launchtic mid-page); the
// NEXT save is the one that gets blocked by the plan gate.
//
// WRITE behavior: requires plan with `whiteLabel: true` (AGENCY / CUSTOM).
// Enforced in the API route, not here — this lib is pure data.

import { db } from "@launchtic/database";
import { getPlanFeatures } from "@launchtic/ee";

// Shape persisted in Organization.brandingConfig JSON. All fields optional;
// missing values resolve to LAUNCHTIC_DEFAULTS at render time.
//
// Logo pair convention: `logoUrl` is the primary mark (used on light bg —
// dark/colored ink). `logoLightUrl` is the alternate for dark backgrounds
// (white/light ink). When `logoLightUrl` is empty, UI falls back to the
// primary `logoUrl` everywhere.
export type BrandingConfig = {
  brandName?:    string; // e.g. "AgencyXYZ Platform" — replaces "launchtic" in chrome
  logoUrl?:      string; // public URL (S3 / agency CDN) — primary logo (light bg)
  logoLightUrl?: string; // alt logo for dark backgrounds. Falls back to logoUrl.
  faviconUrl?:   string; // browser tab icon
  primaryColor?: string; // hex like "#2563eb" — used in CSS var --brand-primary
};

// Resolved branding — every field non-null. What UI components actually consume.
export type ResolvedBranding = Required<Omit<BrandingConfig, "logoUrl" | "logoLightUrl" | "faviconUrl">> & {
  logoUrl:      string | null;
  logoLightUrl: string | null;
  faviconUrl:   string | null;
};

export const LAUNCHTIC_DEFAULTS: ResolvedBranding = {
  brandName:    "launchtic",
  logoUrl:      null,            // null → UI falls back to text wordmark
  logoLightUrl: null,            // null → UI falls back to logoUrl on dark bg
  faviconUrl:   null,            // null → UI uses default /favicon.ico
  primaryColor: "#2563eb",       // tailwind blue-600 (matches current UI baseline)
};

/** Read raw overrides + organization plan in one query. */
export async function getBranding(organizationId: string): Promise<{
  raw: BrandingConfig;
  resolved: ResolvedBranding;
  whiteLabelEnabled: boolean;
}> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { brandingConfig: true, plan: true },
  });
  const raw = (org?.brandingConfig ?? {}) as BrandingConfig;
  const whiteLabelEnabled = getPlanFeatures(org?.plan ?? "COMMUNITY").whiteLabel;
  return { raw, resolved: resolveBranding(raw), whiteLabelEnabled };
}

/** Merge overrides over defaults. Pure function — exported for SSR contexts. */
export function resolveBranding(raw: BrandingConfig | null | undefined): ResolvedBranding {
  const r = raw ?? {};
  return {
    brandName:    r.brandName?.trim()    || LAUNCHTIC_DEFAULTS.brandName,
    logoUrl:      r.logoUrl?.trim()      || null,
    logoLightUrl: r.logoLightUrl?.trim() || null,
    faviconUrl:   r.faviconUrl?.trim()   || null,
    primaryColor: r.primaryColor?.trim() || LAUNCHTIC_DEFAULTS.primaryColor,
  };
}

/** Persist branding. Caller is responsible for plan gating (route layer). */
export async function saveBranding(organizationId: string, patch: BrandingConfig): Promise<BrandingConfig> {
  // Merge patch over existing — UI sends only the fields it changed.
  const existing = await db.organization.findUnique({
    where: { id: organizationId },
    select: { brandingConfig: true },
  });
  const current = (existing?.brandingConfig ?? {}) as BrandingConfig;
  const next: BrandingConfig = { ...current, ...patch };

  // Strip empty strings → store as undefined so resolveBranding falls back
  // cleanly. Keeps the JSON tidy and avoids "saved an empty string" footguns.
  for (const k of Object.keys(next) as (keyof BrandingConfig)[]) {
    const v = next[k];
    if (typeof v === "string" && !v.trim()) delete next[k];
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { brandingConfig: next as any },
  });
  return next;
}

/** Reset branding to defaults (clear the JSON). */
export async function resetBranding(organizationId: string): Promise<void> {
  await db.organization.update({
    where: { id: organizationId },
    data: { brandingConfig: null as any },
  });
}
