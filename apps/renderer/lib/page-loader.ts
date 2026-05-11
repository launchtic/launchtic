import { db } from "@launchtic/database";
import { redis } from "./redis";
import type { RendererPageData } from "@launchtic/types";

const CACHE_TTL = 300; // 5 min

export async function loadPage(
  domain: string,
  slug: string
): Promise<RendererPageData | null> {
  const cacheKey = `page:${domain}:${slug}`;

  // 1. Redis cache (skip in dev)
  if (process.env.NODE_ENV !== "development") {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as RendererPageData;
  }

  // 2. Find workspace — strip port then check for localhost
  const hostname = domain.split(":")[0];
  const isLocalhost = hostname === "localhost" || hostname.startsWith("127.");

  let workspaceId: string;

  if (isLocalhost) {
    // Dev mode: find any step matching slug, but skip steps inside trashed funnels.
    const step = await db.funnelStep.findFirst({
      where: { slug, funnel: { status: "ACTIVE" } },
      include: {
        funnel: true,
        pricePlans: true,
      },
    });
    if (!step) return null;
    // Pass `domain` (incl. port) — `hostname` strips the port and breaks
    // localhost dev links like http://localhost:3001/<slug>.
    return buildPageData(step, slug, cacheKey, domain);
  }

  // 3. Resolve hostname → Domain record. Branch on isDefault:
  //    - Default domain (PAGES_DOMAIN): serves funnels with NO custom-domain
  //      assignment. REPLACE semantics — once a funnel has a custom domain,
  //      it disappears from the default.
  //    - Custom domain: serves only funnels explicitly assigned to it via
  //      FunnelDomain.
  const domainRecord = await db.domain.findUnique({
    where: { domain: hostname, verified: true },
    select: { id: true, workspaceId: true, isDefault: true },
  });
  if (!domainRecord) return null;

  // Defensive `orderBy: updatedAt desc` — slug uniqueness is enforced by the
  // app at write time, but if a duplicate ever sneaks in (race / manual SQL),
  // we pick the most recently edited so behavior is deterministic.
  const funnelStep = domainRecord.isDefault
    ? await db.funnelStep.findFirst({
        where: {
          slug,
          funnel: {
            workspaceId: domainRecord.workspaceId,
            status: "ACTIVE",
            // Funnel must have NO non-default FunnelDomain — i.e. still on default.
            domains: { none: { domain: { isDefault: false } } },
          },
        },
        include: { funnel: true, pricePlans: true },
        orderBy: { updatedAt: "desc" },
      })
    : await db.funnelStep.findFirst({
        where: {
          slug,
          funnel: {
            status: "ACTIVE",
            domains: { some: { domainId: domainRecord.id } },
          },
        },
        include: { funnel: true, pricePlans: true },
        orderBy: { updatedAt: "desc" },
      });

  if (!funnelStep) return null;

  // Pass `domain` (incl. port) — `hostname` strips the port.
  return buildPageData(funnelStep, slug, cacheKey, domain);
}

async function getNextStepUrl(
  funnelStep: { id: string; funnelId: string; order: number },
  host: string
): Promise<string | null> {
  const next = await db.funnelStep.findFirst({
    where: { funnelId: funnelStep.funnelId, order: { gt: funnelStep.order } },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  if (!next) return null;

  const isDev = process.env.NODE_ENV === "development";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.");
  const protocol = isDev || isLocalhost ? "http" : "https";
  return `${protocol}://${host}/${next.slug}`;
}

async function buildPageData(
  funnelStep: any,
  slug: string,
  cacheKey: string,
  host: string
): Promise<RendererPageData> {
  let paymentData = undefined;
  if (funnelStep.type === "CHECKOUT") {
    const wsSettings = await db.workspaceSettings.findUnique({
      where: { workspaceId: funnelStep.funnel.workspaceId },
    });
    const stripe = wsSettings?.stripe as any;
    const paypal = wsSettings?.paypal as any;

    const currency = funnelStep.funnel.currency;
    const pricePlans = funnelStep.pricePlans.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? undefined,
      type: p.type,
      directChargeAmount: p.amount,
      currency,
      interval: p.interval ?? undefined,
      trialDays: p.trialDays ?? undefined,
    }));

    // Physical product for PHYSICAL offer type
    let physicalProduct = undefined;
    if (funnelStep.offerType === "PHYSICAL" && funnelStep.physicalProductId) {
      const prod = await db.physicalProduct.findUnique({
        where: { id: funnelStep.physicalProductId },
      });
      if (prod) {
        physicalProduct = {
          id: prod.id,
          name: prod.name,
          description: prod.description,
          images: prod.images,
          price: prod.price,
          currency: prod.currency,
          options: (prod.options ?? []) as Array<{ id: string; name: string; values: string[] }>,
          variants: (prod.variants ?? []) as Array<{
            id: string;
            name: string;
            combination: string[];
            sku: string | null;
            price: number | null;
            image: string | null;
          }>,
        };
      }
    }

    // Fetch order bumps for this step
    const rawBumps = await db.orderBump.findMany({
      where: { funnelStepId: funnelStep.id },
      include: { pricePlans: { orderBy: { createdAt: "asc" }, take: 1 } },
      orderBy: { order: "asc" },
    });

    // Collect physicalProductIds from PHYSICAL bumps
    const physicalBumpIds = rawBumps
      .filter((b: any) => b.offerType === "PHYSICAL" && b.physicalProductId)
      .map((b: any) => b.physicalProductId as string);

    const physicalBumpProducts = physicalBumpIds.length
      ? await db.physicalProduct.findMany({
          where: { id: { in: physicalBumpIds } },
          select: { id: true, name: true, price: true, currency: true },
        })
      : [];
    const physProdMap = Object.fromEntries(physicalBumpProducts.map((p: any) => [p.id, p]));

    const orderBumps = rawBumps.map((b: any) => {
      const plan = b.pricePlans[0] ?? null;
      const physProd = b.physicalProductId ? (physProdMap[b.physicalProductId] ?? null) : null;
      return {
        id: b.id,
        label: b.label,
        headline: b.headline ?? null,
        offerType: b.offerType ?? null,
        shippingFee: b.shippingFee ?? 0,
        pricePlan: plan
          ? { id: plan.id, name: plan.name, type: plan.type, amount: plan.amount, currency: plan.currency, interval: plan.interval ?? null, trialDays: plan.trialDays ?? null }
          : null,
        physicalProduct: physProd
          ? { id: physProd.id, name: physProd.name, price: physProd.price, currency: physProd.currency }
          : null,
      };
    });

    const paymentMethods = [
      ...(stripe?.publishableKey ? ["stripe" as const] : []),
      ...(paypal?.clientId ? ["paypal" as const] : []),
    ];

    paymentData = {
      paymentMethods,
      stripePublicKey: stripe?.publishableKey ?? undefined,
      paypalClientId: paypal?.clientId ?? null,
      paypalMode: (paypal?.mode ?? "sandbox") as "sandbox" | "live",
      currency,
      offer: { pricePlans },
      checkedPlanId: funnelStep.pricePlans[0]?.id ?? "",
      selectedPaymentMethod: paymentMethods[0] ?? null,
      physicalProduct,
      shippingFee: funnelStep.offerType === "PHYSICAL" ? (funnelStep.shippingFee ?? 0) : 0,
      orderBumps,
    };
  }

  const nextStepUrl = await getNextStepUrl(funnelStep, host);

  const workspace = await db.workspace.findUnique({
    where: { id: funnelStep.funnel.workspaceId },
    select: { plan: true, licenseExpiresAt: true },
  });
  const isLicenseActive =
    workspace?.plan !== "FREE" &&
    (workspace?.licenseExpiresAt == null || workspace.licenseExpiresAt > new Date());
  const showBadge = !isLicenseActive;

  const pageData: RendererPageData = {
    workspaceId: funnelStep.funnel.workspaceId,
    funnelId: funnelStep.funnelId,
    funnelStepId: funnelStep.id,
    nextStepUrl,
    pageJson: funnelStep.pageJson as any,
    payment: paymentData,
    meta: (funnelStep.meta ?? null) as any,
    favicon: funnelStep.funnel.favicon ?? null,
    showBadge,
  };

  if (process.env.NODE_ENV !== "development") {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(pageData));
  }
  return pageData;
}

export async function invalidatePageCache(domain: string, slug: string) {
  await redis.del(`page:${domain}:${slug}`);
}
