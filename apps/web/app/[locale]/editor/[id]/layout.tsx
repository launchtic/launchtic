import { db } from "@launchtic/database";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const step = await db.funnelStep.findUnique({
    where: { id },
    select: { name: true, funnel: { select: { name: true } } },
  });
  if (!step) return { title: "Editor" };
  return { title: `${step.funnel.name} · ${step.name}` };
}

export default function EditorStepLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
