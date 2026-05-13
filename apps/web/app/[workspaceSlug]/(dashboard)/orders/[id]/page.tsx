import { auth } from "../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import OrderDetail from "../../../../../components/orders/OrderDetail";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  return { title: `Order #${id.slice(-8).toUpperCase()}` };
}

export default async function OrderDetailPage({ params }: Params) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const order = await db.order.findFirst({
    where: { id, workspaceId },
    include: {
      contact: true,
      funnelStep: { include: { funnel: true } },
      stepPricePlan: true,
    },
  });

  if (!order) notFound();

  const serialized = {
    id: order.id,
    contactId: order.contactId,
    funnelStepId: order.funnelStepId,
    stepPricePlanId: order.stepPricePlanId,
    status: order.status,
    paymentProvider: order.paymentProvider,
    providerOrderId: order.providerOrderId,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    shippingFee: order.shippingFee,
    total: order.total,
    currency: order.currency,
    quantity: order.quantity,
    variantId: order.variantId,
    physicalProductId: order.physicalProductId,
    refundAmount: order.refundAmount,
    refundedAt: order.refundedAt?.toISOString() ?? null,
    isRenewal: order.isRenewal,
    orderItemSnapshot: order.orderItemSnapshot as any ?? null,
    bumpItems: order.bumpItems as any ?? null,
    shippingAddress: order.shippingAddress as any,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    contact: {
      id: order.contact.id,
      email: order.contact.email,
      firstName: order.contact.firstName,
      lastName: order.contact.lastName,
      phone: order.contact.phone,
      country: order.contact.country,
    },
    funnelStep: order.funnelStep
      ? { name: order.funnelStep.name, funnel: { id: order.funnelStep.funnel.id, name: order.funnelStep.funnel.name } }
      : null,
    stepPricePlan: order.stepPricePlan
      ? { name: order.stepPricePlan.name, type: order.stepPricePlan.type }
      : null,
  };

  return <OrderDetail order={serialized} />;
}
