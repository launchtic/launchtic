import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { demoGuard, maskInDemo } from "../../../../lib/demo";
import { invalidateAllPagesForWorkspace } from "../../../../lib/funnels/step-cache";

const stripeSchema = z.object({
  provider:       z.literal("stripe"),
  publishableKey: z.string().min(1),
  secretKey:      z.string().min(1),
  webhookSecret:  z.string().optional().refine(
    (v) => !v || v.startsWith("whsec_"),
    "Must start with whsec_",
  ),
  mode:           z.enum(["test", "live"]).default("test"),
});

const paypalSchema = z.object({
  provider:     z.literal("paypal"),
  clientId:     z.string().min(1),
  clientSecret: z.string().min(1),
  webhookId:    z.string().optional(),
  mode:         z.enum(["sandbox", "live"]).default("sandbox"),
});

const bodySchema = z.discriminatedUnion("provider", [stripeSchema, paypalSchema]);

export async function GET() {
  try {
    const r = await requireAccess("settings:payment:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const stripe = settings?.stripe as any;
    const paypal = settings?.paypal as any;

    // Return real values — UI hides them behind a reveal toggle.
    return ok({
      stripe: stripe ? {
        publishableKey: stripe.publishableKey ?? "",
        secretKey:      maskInDemo(stripe.secretKey ?? ""),
        webhookSecret:  stripe.webhookSecret ? maskInDemo(stripe.webhookSecret) : null,
        mode:           stripe.mode ?? "test",
      } : null,
      paypal: paypal ? {
        clientId:     paypal.clientId ?? "",
        clientSecret: maskInDemo(paypal.clientSecret ?? ""),
        webhookId:    paypal.webhookId ?? null,
        mode:         paypal.mode ?? "sandbox",
      } : null,
    });
  } catch (error) {
    console.error(error);
    return err("Failed to load payment config", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:payment:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = bodySchema.parse(await req.json());
    const { provider, ...data } = body;

    await db.workspaceSettings.upsert({
      where:  { workspaceId },
      create: { workspaceId, [provider]: data },
      update: { [provider]: data },
    });

    // PayPal clientId is embedded in pageJson (SDK loads with it client-side);
    // Stripe publishableKey is read from settings at render-time but cached
    // alongside the page. Either rotation must bust all cached pages or buyers
    // continue hitting the OLD provider's SDK.
    await invalidateAllPagesForWorkspace(workspaceId);

    return ok({ provider });
  } catch (error) {
    console.error(error);
    return err("Failed to save payment config", 500);
  }
}
