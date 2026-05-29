import { redis } from "./redis";

// "Purchase session" — links a freshly completed checkout to the visitor's
// `lt_sid` so a downstream UPSELL/DOWNSELL page can charge them one-click
// (off-session) without re-collecting card details. Written when the main
// order is confirmed; read by /api/checkout/upsell. Best-effort: a Redis
// hiccup just means the upsell falls back to an interactive payment modal.

const TTL_SECONDS = 2 * 60 * 60; // 2h — long enough for a buyer to walk a funnel
const key = (sid: string) => `lt_purchase:${sid}`;

export type PurchaseSession = {
  contactId:   string;
  workspaceId: string;
  currency:    string;
  provider:    "stripe" | "paypal" | "free";
  // Set for Stripe purchases — lets the upsell charge off-session. Absent for
  // PayPal/free → the upsell falls back to a payment modal.
  stripeCustomerId?: string | null;
};

export async function writePurchaseSession(sid: string | null | undefined, s: PurchaseSession): Promise<void> {
  if (!sid) return;
  try {
    await redis.set(key(sid), JSON.stringify(s), "EX", TTL_SECONDS);
  } catch {
    /* non-fatal — upsell will just require an interactive payment */
  }
}

export async function readPurchaseSession(sid: string | null | undefined): Promise<PurchaseSession | null> {
  if (!sid) return null;
  try {
    const raw = await redis.get(key(sid));
    return raw ? (JSON.parse(raw) as PurchaseSession) : null;
  } catch {
    return null;
  }
}
