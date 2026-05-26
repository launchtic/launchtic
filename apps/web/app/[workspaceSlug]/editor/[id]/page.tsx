import { db } from "@launchtic/database";
import { getActiveBranding } from "../../../../lib/branding";
import { getRendererUrl } from "../../../../lib/system-config";
import EditorAppDynamic from "../../../../components/editor/EditorAppDynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string; workspaceSlug: string }> }) {
  const { id, workspaceSlug } = await params;

  // Resolve branding for the editor's in-app logo (dark canvas → prefer the
  // light variant). Fall back chain:
  //   logoLightUrl → logoUrl → null (elements package renders /logo-light.svg)
  // Favicon + tab title are handled by the ROOT layout's generateMetadata.
  const ws = await db.workspace.findFirst({
    where: { slug: workspaceSlug },
    select: { organizationId: true },
  });
  const branding = ws ? await getActiveBranding(ws.organizationId) : null;
  const editorLogo = branding?.logoLightUrl ?? branding?.logoUrl ?? null;
  const brandName  = branding?.brandName ?? "launchtic";
  const rendererUrl = await getRendererUrl();

  return (
    <EditorAppDynamic
      funnelStepId={id}
      rendererUrl={rendererUrl}
      workspaceSlug={workspaceSlug}
      brandLogoUrl={editorLogo}
      brandName={brandName}
    />
  );
}
