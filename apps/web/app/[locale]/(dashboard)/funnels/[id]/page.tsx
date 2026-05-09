import { auth } from "../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import FunnelStepManager from "../../../../../components/funnels/FunnelStepManager";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const funnel = await db.funnel.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: funnel?.name ?? "Funnel" };
}

export default async function FunnelDetailPage({ params }: Params) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const workspaceId = (session as any).workspaceId as string | null;

  const funnel = await db.funnel.findUnique({
    where: { id, workspaceId: workspaceId ?? "" },
    include: {
      steps: { orderBy: { order: "asc" } },
      domains: {
        include: { domain: { select: { domain: true, verified: true } } },
        take: 1,
      },
    },
  });

  if (!funnel) notFound();

  const steps = funnel.steps.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.type,
    order: s.order,
  }));

  const primaryDomain = funnel.domains[0]?.domain.verified
    ? funnel.domains[0].domain.domain
    : null;

  return (
    <FunnelStepManager
      funnel={{ id: funnel.id, name: funnel.name, primaryDomain }}
      initialSteps={steps}
      rendererUrl={process.env.RENDERER_URL!}
    />
  );
}
