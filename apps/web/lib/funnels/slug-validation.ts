// Slug uniqueness rules for FunnelStep slugs.
//
// Mental model: each ACTIVE funnel lives in a "URL space" — the effective
// hostname its pages are served on. Slugs only need to be unique within
// a URL space, not globally.
//
//   • Funnel with no FunnelDomain entries → lives on the default domain
//     (PAGES_DOMAIN). It shares the URL space with every other funnel
//     in the workspace also without FunnelDomain entries.
//
//   • Funnel with FunnelDomain entries → lives on those custom domains.
//     It is REMOVED from the default domain (REPLACE semantics — set by the
//     renderer's isDefault branch). Slugs collide only with other funnels
//     assigned to at least one shared custom domain.
//
// Trashed funnels are ignored — their pages don't render so the slugs are
// free for reuse. Restore re-runs validation per step.
//
// All four mutation paths must call assertSlugAvailable:
//   1. Create step          → POST   /api/funnels/:id/steps
//   2. Rename slug          → PATCH  /api/funnel-steps/:id  (when slug changes)
//   3. Assign custom domain → POST   /api/funnel-domains    (per step)
//   4. Unassign custom dom. → DELETE /api/funnel-domains    (per step, fallback to default)
//   5. Restore from trash   → POST   /api/funnels/:id/restore (per step)

import { db } from "@launchtic/database";

export class SlugConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictFunnelId: string,
    public readonly conflictFunnelName: string,
    public readonly conflictSlug: string,
  ) {
    super(message);
    this.name = "SlugConflictError";
  }
}

type AssertOpts = {
  workspaceId: string;
  funnelId: string;
  slug: string;
  // When renaming or re-validating an existing step, exclude it from the
  // conflict scan (the step's own row would otherwise match itself).
  excludeStepId?: string;
  // When evaluating a hypothetical domain change, override the funnel's
  // current FunnelDomain set with the post-change set. Used by the
  // assign/unassign endpoints to validate BEFORE writing the change.
  overrideCustomDomainIds?: string[] | null; // null = treat as on default
};

// Throws SlugConflictError if the slug is already taken in the funnel's
// effective URL space. Returns nothing on success.
export async function assertSlugAvailable(opts: AssertOpts): Promise<void> {
  const { workspaceId, funnelId, slug, excludeStepId } = opts;

  let customDomainIds: string[];
  if (opts.overrideCustomDomainIds !== undefined) {
    customDomainIds = opts.overrideCustomDomainIds ?? [];
  } else {
    const funnel = await db.funnel.findUnique({
      where: { id: funnelId },
      select: {
        domains: {
          select: { domain: { select: { id: true, isDefault: true } } },
        },
      },
    });
    if (!funnel) throw new Error("Funnel not found");
    // Default domain assignments don't count — we treat the funnel as
    // "on default" if it has no CUSTOM (non-default) domain assignments.
    customDomainIds = funnel.domains
      .filter((d) => !d.domain.isDefault)
      .map((d) => d.domain.id);
  }

  const onDefault = customDomainIds.length === 0;

  const conflict = await db.funnelStep.findFirst({
    where: {
      slug,
      ...(excludeStepId && { id: { not: excludeStepId } }),
      funnel: {
        status: "ACTIVE",
        id: { not: funnelId },
        ...(onDefault
          ? {
              workspaceId,
              // Other funnels also living on the default — they have no
              // non-default FunnelDomain entries.
              domains: { none: { domain: { isDefault: false } } },
            }
          : {
              // Other funnels sharing at least one custom domain with this one.
              domains: { some: { domainId: { in: customDomainIds } } },
            }),
      },
    },
    select: {
      slug: true,
      funnel: { select: { id: true, name: true } },
    },
  });

  if (conflict) {
    throw new SlugConflictError(
      `Slug "${slug}" is already used by funnel "${conflict.funnel.name}" on the same domain.`,
      conflict.funnel.id,
      conflict.funnel.name,
      slug,
    );
  }
}

// Convenience: validate every step of a funnel (used when assigning/unassigning
// a domain or restoring from trash — the slugs themselves don't change but
// the URL space does, so previously-fine slugs may now collide).
export async function assertAllStepSlugsAvailable(
  workspaceId: string,
  funnelId: string,
  overrideCustomDomainIds: string[] | null,
): Promise<void> {
  const steps = await db.funnelStep.findMany({
    where: { funnelId },
    select: { id: true, slug: true },
  });
  for (const step of steps) {
    await assertSlugAvailable({
      workspaceId,
      funnelId,
      slug: step.slug,
      excludeStepId: step.id,
      overrideCustomDomainIds,
    });
  }
}

// ─── Slug generation ──────────────────────────────────────────────────────────
//
// Auto-generate a slug from a free-form name (typically the step name). When
// the candidate collides — within the funnel OR across funnels in the same URL
// space — append `-2`, `-3`, ... until unique. Used at create time so users
// (and the AI assistant) never see slug-conflict errors during step creation.
// Manual rename (PATCH) keeps the strict 409 path.

const MAX_SLUG_ATTEMPTS = 100;

function slugifyText(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return base || "step";
}

type GenerateOpts = {
  workspaceId: string;
  funnelId: string;
  // Free-form text — typically the step name. Will be slugified.
  baseName: string;
  // For renames — exclude the step's own row from intra-funnel collision check.
  excludeStepId?: string;
  // For batch generation in the AI tool: slugs already claimed in the current
  // batch but not yet written to DB. Pass a Set the caller maintains.
  seen?: Set<string>;
  // For hypothetical URL space (e.g. step is being created on a brand-new
  // funnel that hasn't been assigned a domain yet — pass [] for default space).
  overrideCustomDomainIds?: string[] | null;
};

async function isSlugAvailable(
  candidate: string,
  opts: GenerateOpts,
): Promise<boolean> {
  if (opts.seen?.has(candidate)) return false;

  // Intra-funnel: DB unique constraint @@unique([funnelId, slug]).
  const intra = await db.funnelStep.findUnique({
    where: { funnelId_slug: { funnelId: opts.funnelId, slug: candidate } },
    select: { id: true },
  });
  if (intra && intra.id !== opts.excludeStepId) return false;

  // Cross-funnel: URL-space rule.
  try {
    await assertSlugAvailable({
      workspaceId: opts.workspaceId,
      funnelId: opts.funnelId,
      slug: candidate,
      excludeStepId: opts.excludeStepId,
      overrideCustomDomainIds: opts.overrideCustomDomainIds,
    });
    return true;
  } catch (e) {
    if (e instanceof SlugConflictError) return false;
    throw e;
  }
}

export async function generateUniqueSlug(opts: GenerateOpts): Promise<string> {
  const base = slugifyText(opts.baseName);
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (await isSlugAvailable(candidate, opts)) {
      opts.seen?.add(candidate);
      return candidate;
    }
  }
  throw new Error(
    `Could not generate a unique slug for "${opts.baseName}" after ${MAX_SLUG_ATTEMPTS} attempts.`,
  );
}
