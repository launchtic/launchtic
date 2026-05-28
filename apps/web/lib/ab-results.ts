import { db } from "@launchtic/database";

// A/B test results: per-variant conversion + a 2-proportion z-test vs the
// control so the UI can flag a statistically significant winner.

export type VariantResult = {
  variantId:      string;
  name:           string;
  isControl:      boolean;
  weight:         number;
  views:          number;
  conversions:    number;   // leads + purchases (the step's forward action)
  revenueCents:   number;
  conversionRate: number;   // conversions / views (0–1)
  // vs control:
  uplift:         number | null;   // relative % change in conversion rate (null for control / no data)
  confidence:     number | null;   // 0–1 significance (null for control / insufficient data)
  isWinner:       boolean;          // best converting variant with ≥95% confidence
};

export type AbResults = {
  stepId:   string;
  active:   boolean;
  variants: VariantResult[];
};

// Standard normal CDF (Abramowitz & Stegun 7.1.26) — good to ~1e-7.
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Two-proportion z-test → confidence that the two conversion rates differ.
function twoProportionConfidence(
  conv1: number, n1: number,
  conv2: number, n2: number,
): number | null {
  if (n1 < 1 || n2 < 1) return null;
  const p1 = conv1 / n1;
  const p2 = conv2 / n2;
  const pPool = (conv1 + conv2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = (p1 - p2) / se;
  // Two-tailed confidence that they differ.
  return 2 * normalCdf(Math.abs(z)) - 1;
}

export async function getAbResults(stepId: string, from: Date, to: Date): Promise<AbResults> {
  const step = await db.funnelStep.findUnique({
    where: { id: stepId },
    select: {
      abTestActive: true,
      variants: {
        select: { id: true, name: true, isControl: true, weight: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!step || step.variants.length === 0) {
    return { stepId, active: false, variants: [] };
  }

  const variantIds = step.variants.map((v) => v.id);
  const grouped = await db.funnelEvent.groupBy({
    by:     ["variantId", "type"],
    where:  { stepId, variantId: { in: variantIds }, createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum:   { amountCents: true },
  });

  type Acc = { views: number; conversions: number; revenueCents: number };
  const byVariant = new Map<string, Acc>();
  const blank = (): Acc => ({ views: 0, conversions: 0, revenueCents: 0 });
  for (const g of grouped) {
    if (!g.variantId) continue;
    const acc = byVariant.get(g.variantId) ?? blank();
    const n = g._count._all;
    if (g.type === "VIEW") acc.views += n;
    else { acc.conversions += n; if (g.type === "PURCHASE") acc.revenueCents += g._sum.amountCents ?? 0; }
    byVariant.set(g.variantId, acc);
  }

  const control = step.variants.find((v) => v.isControl) ?? step.variants[0];
  const controlAcc = byVariant.get(control.id) ?? blank();
  const controlRate = controlAcc.views > 0 ? controlAcc.conversions / controlAcc.views : 0;

  const results: VariantResult[] = step.variants.map((v) => {
    const a = byVariant.get(v.id) ?? blank();
    const rate = a.views > 0 ? a.conversions / a.views : 0;
    const isControl = v.id === control.id;
    return {
      variantId:      v.id,
      name:           v.name,
      isControl,
      weight:         v.weight,
      views:          a.views,
      conversions:    a.conversions,
      revenueCents:   a.revenueCents,
      conversionRate: rate,
      uplift:         isControl || controlRate === 0 ? null : (rate - controlRate) / controlRate,
      confidence:     isControl ? null : twoProportionConfidence(a.conversions, a.views, controlAcc.conversions, controlAcc.views),
      isWinner:       false, // set below
    };
  });

  // Winner = highest conversion rate among non-controls with ≥95% confidence.
  let best: VariantResult | null = null;
  for (const r of results) {
    if (r.isControl) continue;
    if ((r.confidence ?? 0) >= 0.95 && r.conversionRate > controlRate) {
      if (!best || r.conversionRate > best.conversionRate) best = r;
    }
  }
  if (best) best.isWinner = true;

  return { stepId, active: step.abTestActive, variants: results };
}
