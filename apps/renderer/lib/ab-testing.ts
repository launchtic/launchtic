import { db } from "@launchtic/database";

// Deterministic A/B variant assignment. The same (sessionId, variant set)
// always yields the same pick, so a visitor sees ONE variant consistently
// across the VIEW (page render), LEAD (form submit), and PURCHASE (checkout)
// events — without storing the assignment anywhere. Recomputed in each route
// from the same inputs.

type WeightedVariant = { id: string; weight: number };

// FNV-1a 32-bit hash — small, fast, dependency-free, good enough for bucketing.
function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick a variant for a visitor by weight. Deterministic on sessionId so the
 * assignment is sticky. Returns the chosen variant's id, or null when there
 * are no variants (no active test) / total weight is zero.
 */
export function pickVariantId<T extends WeightedVariant>(
  sessionId: string,
  variants: T[],
): string | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return variants[0].id;

  // Map the session hash into [0, total) and walk cumulative weights.
  const bucket = hash32(sessionId || "anon") % total;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (bucket < acc) return v.id;
  }
  return variants[variants.length - 1].id; // float-safe fallback
}

/**
 * Resolve which variant a visitor is assigned for a step, for attributing
 * LEAD / PURCHASE events. Returns null when the step has no active test.
 * One indexed query; safe to call from API routes.
 */
export async function getAssignedVariantId(
  stepId: string,
  sessionId: string | null | undefined,
): Promise<string | null> {
  if (!sessionId) return null;
  const step = await db.funnelStep.findUnique({
    where: { id: stepId },
    select: {
      abTestActive: true,
      variants: { select: { id: true, weight: true } },
    },
  });
  if (!step?.abTestActive || step.variants.length === 0) return null;
  return pickVariantId(sessionId, step.variants);
}
