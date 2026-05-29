import { db } from "@launchtic/database";
import { StripeProvider } from "./stripe";
import { PayPalProvider } from "./paypal";
import type { PaymentProvider } from "./types";

export async function getProvider(workspaceId: string, method: string): Promise<PaymentProvider> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const config = (settings as any)?.[method];

  if (method === "stripe") {
    if (!config?.secretKey) throw new Error("Stripe not configured for this workspace");
    return new StripeProvider(config.secretKey, config.webhookSecret ?? "");
  }

  if (method === "paypal") {
    if (!config?.clientId || !config?.clientSecret) throw new Error("PayPal not configured for this workspace");
    return new PayPalProvider(config.clientId, config.clientSecret, config.mode ?? "sandbox");
  }

  throw new Error(`Unsupported payment method: ${method}`);
}

// Typed Stripe accessor — the off-session one-click-upsell methods live on
// StripeProvider, not the shared PaymentProvider interface.
export async function getStripeProvider(workspaceId: string): Promise<StripeProvider> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const config = (settings as any)?.stripe;
  if (!config?.secretKey) throw new Error("Stripe not configured for this workspace");
  return new StripeProvider(config.secretKey, config.webhookSecret ?? "");
}

export async function getPayPalProvider(workspaceId: string): Promise<PayPalProvider> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const config = (settings as any)?.paypal;
  if (!config?.clientId || !config?.clientSecret) throw new Error("PayPal not configured for this workspace");
  return new PayPalProvider(config.clientId, config.clientSecret, config.mode ?? "sandbox");
}
