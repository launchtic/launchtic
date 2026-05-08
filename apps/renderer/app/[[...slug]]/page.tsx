import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { loadPage } from "../../lib/page-loader";
import PageRenderClient from "../../components/PageRenderClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug?: string[] }> };

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
    </>
  );
}
