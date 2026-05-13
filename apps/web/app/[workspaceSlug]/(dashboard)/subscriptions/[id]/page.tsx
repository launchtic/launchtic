import { auth } from "../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import SubscriptionDetail from "../../../../../components/subscriptions/SubscriptionDetail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sub = await db.subscription.findUnique({
    where: { id },
    select: { contact: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!sub) return { title: "Subscription" };
  const c = sub.contact;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return { title: `Subscription — ${fullName || c.email}` };
}

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const { id } = await params;

  const subscription = await db.subscription.findFirst({
    where: { id, workspaceId },
    include: {
      contact: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, country: true } },
      funnelStep: { include: { funnel: { select: { id: true, name: true } } } },
      stepPricePlan: { select: { id: true, name: true, type: true, amount: true, currency: true, interval: true, trialDays: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, total: true, currency: true, invoiceId: true,
          isRenewal: true, createdAt: true, orderItemSnapshot: true,
        },
      },
    },
  });

  if (!subscription) notFound();

  return <SubscriptionDetail subscription={JSON.parse(JSON.stringify(subscription))} />;
}
