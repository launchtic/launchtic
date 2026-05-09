import EditorAppDynamic from "../../../../components/editor/EditorAppDynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorAppDynamic funnelStepId={id} rendererUrl={process.env.RENDERER_URL!} />;
}
