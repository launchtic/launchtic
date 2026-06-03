import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import type { Metadata } from "next";
import { db } from "@launchtic/database";
import { loadPage } from "../../lib/page-loader";
import { recordFunnelEvent, SID_HEADER } from "../../lib/funnel-events";
import { pickVariantId } from "../../lib/ab-testing";
import { fireTrigger } from "../../lib/automations";
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

  // PAGE_VISITED trigger — fires when a known contact (identified via the
  // `lt_contact` cookie set on email-link click) loads a funnel page.
  // Server-side fire so we don't ship an extra client script; cookie scope
  // is HttpOnly anyway so JS can't read it.
  const cookieStore = await cookies();
  const ltContact   = cookieStore.get("lt_contact")?.value;
  if (ltContact) {
    void firePageVisited(ltContact, pageData.funnelId, pageData.funnelStepId);
  }

  return (
    <PageRenderClient
      pageData={{
        funnelStepId: pageData.funnelStepId,
        nextStepUrl: pageData.nextStepUrl,
        pageJson,
        payment: pageData.payment,
        meta: pageData.meta ?? null,
        upsell: pageData.upsell ?? null,
      }}
    />
  );
}

// Verify the cookie's contact belongs to this funnel's workspace before
// firing. A stale cookie pointing at a deleted / cross-workspace contact
// would otherwise enroll the wrong account's workflows. Fire-and-forget so
// the page render isn't blocked by trigger fanout (queue.add + DB writes).
async function firePageVisited(
  contactId:    string,
  funnelId:     string,
  funnelStepId: string,
): Promise<void> {
  try {
    const funnel = await db.funnel.findUnique({
      where:  { id: funnelId },
      select: { workspaceId: true },
    });
    if (!funnel) return;
    const contact = await db.contact.findFirst({
      where:  { id: contactId, workspaceId: funnel.workspaceId },
      select: { id: true },
    });
    if (!contact) return;
    await fireTrigger(funnel.workspaceId, "PAGE_VISITED", {
      contactId, funnelId, funnelStepId,
    });
  } catch (err) {
    console.error("[page-visited] trigger failed:", err);
  }
}
