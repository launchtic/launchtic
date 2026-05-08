import Stripe from "stripe";

const WEBHOOK_SECRET  = "whsec_...";                      // từ stripe listen
const SALE_REFERENCE  = "in_1TOxzPAtpmrrFNaRasYI9e8d";
const DISPUTE_ID      = `dp_test_${Date.now()}`;

async function trigger(type, extra = {}) {
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    type,
    data: {
      object: {
        id: DISPUTE_ID,
        object: "dispute",
        charge: SALE_REFERENCE,
        amount: 20000,
        currency: "usd",
        reason: "fraudulent",
        status: "needs_response",
        metadata: {},
        ...extra,
      },
    },
  });

  const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch("http://localhost:3001/api/webhook/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sig },
    body: payload,
  });
  console.log(type, "→", await res.json());
}

await trigger("charge.dispute.created");
await trigger("charge.dispute.closed", { status: "lost" });
