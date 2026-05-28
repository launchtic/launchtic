import { db } from "@launchtic/database";

// Aggregates FunnelEvent rows into a per-step funnel report. Queried directly
// (no pre-aggregation table yet) — fine at self-host scale thanks to the
// (funnelId, type, createdAt) index. Promote to a daily rollup table if a
// single instance ever pushes millions of events.

export type FunnelStepStat = {
  stepId:       string;
  name:         string;
  type:         string;
  order:        number;
  views:        number;
  leads:        number;
  purchases:    number;
  revenueCents: number;
};

export type FunnelAnalytics = {
  funnelId:          string;
  from:              string;
  to:                string;
  steps:             FunnelStepStat[];
  totals:            { views: number; leads: number; purchases: number; revenueCents: number };
  // Average cart value = total revenue ÷ paid orders (0 when no purchases).
  avgCartValueCents: number;
};

export async function getFunnelAnalytics(
  funnelId: string,
  from: Date,
  to: Date,
): Promise<FunnelAnalytics> {
  const [steps, grouped] = await Promise.all([
    db.funnelStep.findMany({
      where:   { funnelId },
      select:  { id: true, name: true, type: true, order: true },
      orderBy: { order: "asc" },
    }),
    db.funnelEvent.groupBy({
      by:     ["stepId", "type"],
      where:  { funnelId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum:   { amountCents: true },
    }),
  ]);

  // Fold the grouped (stepId × type) rows into a per-step accumulator.
  type Acc = { views: number; leads: number; purchases: number; revenueCents: number };
  const byStep = new Map<string, Acc>();
  const blank = (): Acc => ({ views: 0, leads: 0, purchases: 0, revenueCents: 0 });

  for (const g of grouped) {
    const acc = byStep.get(g.stepId) ?? blank();
    const n = g._count._all;
    if (g.type === "VIEW") acc.views += n;
    else if (g.type === "LEAD") acc.leads += n;
    else if (g.type === "PURCHASE") {
      acc.purchases += n;
      acc.revenueCents += g._sum.amountCents ?? 0;
    }
    byStep.set(g.stepId, acc);
  }

  const stepStats: FunnelStepStat[] = steps.map((s) => {
    const acc = byStep.get(s.id) ?? blank();
    return { stepId: s.id, name: s.name, type: s.type, order: s.order, ...acc };
  });

  const totals = stepStats.reduce(
    (t, s) => ({
      views:        t.views + s.views,
      leads:        t.leads + s.leads,
      purchases:    t.purchases + s.purchases,
      revenueCents: t.revenueCents + s.revenueCents,
    }),
    { views: 0, leads: 0, purchases: 0, revenueCents: 0 },
  );

  const avgCartValueCents = totals.purchases > 0
    ? Math.round(totals.revenueCents / totals.purchases)
    : 0;

  return {
    funnelId,
    from: from.toISOString(),
    to: to.toISOString(),
    steps: stepStats,
    totals,
    avgCartValueCents,
  };
}

/** Parse a `?days=N` window (default 30, clamped 1–365) into a [from, to] range. */
export function rangeFromDays(daysParam: string | null): { from: Date; to: Date } {
  const days = Math.min(365, Math.max(1, Number(daysParam) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Resolve a date window from explicit `from`/`to` ISO query params, falling
 * back to `?days=N` (default 30). The client computes preset ranges (this
 * month / last month / all time / custom calendar) and sends from+to; this
 * just validates + bounds them. "All time" = the client sends a very old from.
 */
export function parseRange(params: URLSearchParams): { from: Date; to: Date } {
  const fromStr = params.get("from");
  const toStr   = params.get("to");
  if (fromStr && toStr) {
    const from = new Date(fromStr);
    const to   = new Date(toStr);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }
  return rangeFromDays(params.get("days"));
}
