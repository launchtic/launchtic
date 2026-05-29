import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window { paypal?: any; data?: any; }
}

// Standalone PayPal "pay again" modal for the upsell Accept button. Used when
// one-click isn't possible (PayPal main purchase / no saved card) and the
// workspace has PayPal configured (window.data.upsell.paypalClientId set).
// Handles BOTH a one-time order and a subscription offer. Self-contained —
// unlike PayPalButtonWrapper it has no checkout form / payment context; the
// offer + contact come from the server via the purchase session.
export function UpsellPayPalModal({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const data = typeof window !== "undefined" ? (window as any).data : null;
  const upsell = data?.upsell ?? null;
  const funnelStepId: string | null = data?.funnelStepId ?? null;
  const clientId: string | undefined = upsell?.paypalClientId;
  const currency = String(upsell?.currency ?? "USD").toUpperCase();
  const isSubscription = upsell?.type === "SUBSCRIPTION";

  // Load the PayPal SDK once. Subscriptions need vault + intent=subscription.
  useEffect(() => {
    if (!clientId) { setError("PayPal is not available."); return; }
    if (window.paypal) { setSdkReady(true); return; }
    const extra = isSubscription ? "&vault=true&intent=subscription" : "";
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=buttons&currency=${currency}${extra}`;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError("Failed to load PayPal.");
    document.body.appendChild(script);
  }, [clientId, currency, isSubscription]);

  // Render Smart Buttons.
  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal || !upsell?.pricePlanId || !funnelStepId) return;
    containerRef.current.innerHTML = "";

    const start = async (field: "paypalOrderId" | "paypalSubscriptionId") => {
      setProcessing(true);
      setError(null);
      const res = await fetch("/api/checkout/upsell/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelStepId, pricePlanId: upsell.pricePlanId }),
      });
      const json = await res.json();
      if (!json.success || !json[field]) {
        setProcessing(false);
        throw new Error(json.error ?? "Failed to start PayPal");
      }
      return json[field] as string;
    };

    const finish = async (id: string) => {
      try {
        setProcessing(true);
        const res = await fetch("/api/checkout/upsell/paypal/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Capture failed");
        const next = json.nextStepUrl ?? upsell.acceptUrl;
        if (next) window.location.href = next;
      } catch (err: any) {
        setProcessing(false);
        setError(err?.message ?? "PayPal payment failed");
      }
    };

    const common = {
      style: { layout: "vertical" as const, color: "gold" as const, shape: "rect" as const, label: "paypal" as const },
      onCancel: () => setProcessing(false),
      onError: (err: any) => { setProcessing(false); setError(err?.message ?? "PayPal error"); },
    };

    const config = isSubscription
      ? { ...common, createSubscription: () => start("paypalSubscriptionId"), onApprove: (d: any) => finish(d.subscriptionID) }
      : { ...common, createOrder: () => start("paypalOrderId"), onApprove: (d: any) => finish(d.orderID) };

    let buttons: any;
    let cancelled = false;
    try {
      buttons = window.paypal.Buttons(config);
      if (buttons.isEligible?.() === false) { setError("PayPal isn't available right now."); return; }
      // .render() is async; swallow its rejection so a teardown mid-render
      // (modal closed / re-rendered fast) doesn't bubble as an unhandled
      // PayPal SDK exception.
      Promise.resolve(buttons.render(containerRef.current)).catch((err: any) => {
        if (!cancelled) console.warn("[upsell paypal] render failed", err);
      });
    } catch (err) {
      console.warn("[upsell paypal] init failed", err);
    }

    // Tear the buttons down on unmount (StrictMode double-invoke, or the user
    // closing the modal mid-render). Otherwise PayPal keeps rendering into a
    // detached node → paypal_js_sdk_v5_unhandled_exception.
    return () => {
      cancelled = true;
      try { buttons?.close?.(); } catch { /* already closed */ }
    };
  }, [sdkReady]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>Complete your purchase</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "#666" }}>×</button>
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {!sdkReady && !error && <div style={{ color: "#666", fontSize: 14, padding: "12px 0" }}>Loading PayPal…</div>}
        <div ref={containerRef} style={{ minHeight: 45 }} />
        {processing && <div style={{ color: "#666", fontSize: 13, marginTop: 8, textAlign: "center" }}>Processing…</div>}
      </div>
    </div>
  );
}
