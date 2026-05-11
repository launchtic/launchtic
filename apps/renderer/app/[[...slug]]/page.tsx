import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { loadPage } from "../../lib/page-loader";
import PageRenderClient from "../../components/PageRenderClient";
import PoweredByBadge from "../../components/PoweredByBadge";

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

  return (
    <>
      <PageRenderClient
        pageData={{
          funnelStepId: pageData.funnelStepId,
          nextStepUrl: pageData.nextStepUrl,
          pageJson: pageData.pageJson as Record<string, unknown>,
          payment: pageData.payment,
          meta: pageData.meta ?? null,
        }}
      />
      {pageData.showBadge && <PoweredByBadge />}
    </>
  );
}
