import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { loadPage } from "../../lib/page-loader";
import { recordFunnelEvent, SID_HEADER } from "../../lib/funnel-events";
import { pickVariantId } from "../../lib/ab-testing";
import PageRenderClient from "../../components/PageRenderClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const pageSlug = slug ? slug.join("/") : "";

  const pageData = await loadPage(host, pageSlug);
  const seo = (pageData?.meta as any)?.seo ?? {};

  const favicon = pageData?.favicon ?? null;

  return {
    title: seo.title ?? undefined,
    description: seo.description ?? undefined,
    openGraph: seo.ogImage ? { images: [seo.ogImage] } : undefined,
    icons: favicon ? { icon: favicon } : undefined,
  };
}

export default async function PublishedPage({ params }: Props) {
  const { slug } = await params;
  const headersList = await headers();

  const host = headersList.get("host") ?? "";
  const pageSlug = slug ? slug.join("/") : "";

  const pageData = await loadPage(host, pageSlug);
  if (!pageData) return notFound();

  const sessionId = headersList.get(SID_HEADER);

  // A/B test: pick a variant for this visitor (deterministic on sessionId, so
  // they stick to one). Serve the variant's pageJson and tag the VIEW with its
  // id; LEAD/PURCHASE recompute the same assignment for matching attribution.
  let pageJson = pageData.pageJson as Record<string, unknown>;
  let variantId: string | null = null;
  if (pageData.abTestActive && pageData.variants && pageData.variants.length > 0) {
    variantId = pickVariantId(sessionId ?? "anon", pageData.variants);
    const chosen = pageData.variants.find((v) => v.id === variantId);
    if (chosen) pageJson = chosen.pageJson as Record<string, unknown>;
  }

  // Record a VIEW for funnel analytics. Best-effort, never blocks render.
  await recordFunnelEvent({
    type:         "VIEW",
    funnelId:     pageData.funnelId,
    funnelStepId: pageData.funnelStepId,
    sessionId,
    variantId,
    ip:           headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return (
    <PageRenderClient
      pageData={{
        funnelStepId: pageData.funnelStepId,
        nextStepUrl: pageData.nextStepUrl,
        pageJson,
        payment: pageData.payment,
        meta: pageData.meta ?? null,
      }}
    />
  );
}
