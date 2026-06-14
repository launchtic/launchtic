import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getRendererUrl } from "../../../../../lib/system-config";
import { maskInDemo } from "../../../../../lib/demo";
import PaymentPanel from "../../../../../components/settings/PaymentPanel";

export const metadata = { title: "Payment Settings" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "settings:payment:read");

  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });

  const stripe = settings?.stripe as any;
  const paypal = settings?.paypal as any;

  const rendererUrl = await getRendererUrl();

  return (
    <div className="p-6 sm:p-8">
      <PaymentPanel
        stripe={stripe ? {
          publishableKey: stripe.publishableKey ?? "",
          secretKey:      maskInDemo(stripe.secretKey ?? ""),
          webhookSecret:  stripe.webhookSecret ? maskInDemo(stripe.webhookSecret) : null,
          mode:           stripe.mode ?? "test",
        } : null}
        paypal={paypal ? {
          clientId:     paypal.clientId ?? "",
          clientSecret: maskInDemo(paypal.clientSecret ?? ""),
          webhookId:    paypal.webhookId ?? null,
          mode:         paypal.mode ?? "sandbox",
        } : null}
        rendererUrl={rendererUrl}
      />
    </div>
  );
}
