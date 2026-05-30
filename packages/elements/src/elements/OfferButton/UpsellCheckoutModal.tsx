import React, { useEffect, useRef, useState } from "react";
import { useSafePayment } from "../../contexts/PaymentContext";
import countries from "../Field/countries.json";

declare global {
  interface Window { paypal?: any; data?: any; }
}

export type ShippingAddress = {
  name:       string;
  line1:      string;
  line2?:     string;
  city:       string;
  state?:     string;
  postalCode: string;
  country:    string;
};

// Unified upsell-fallback modal. Renders whichever sections the parent asks for:
//   - Address form          (when the main checkout was digital-only)
//   - "Continue with card"  (Stripe one-click using the saved card)
//   - PayPal Smart Buttons  (when one-click Stripe isn't available)
// The modal owns its own form state + API calls; OfferButton just decides
// which sections are needed based on the server response.
export function UpsellCheckoutModal({
  needsAddress,
  showStripe,
  showPayPal,
  initialAddress,
  onClose,
}: {
  needsAddress: boolean;
  showStripe:   boolean;
  showPayPal:   boolean;
  initialAddress?: Partial<ShippingAddress> | null;
  onClose:        () => void;
}) {
  const data = typeof window !== "undefined" ? (window as any).data : null;
  const upsell        = data?.upsell ?? null;
  const funnelStepId: string | null = data?.funnelStepId ?? null;
  const clientId: string | undefined = upsell?.paypalClientId;
  const currency = String(upsell?.currency ?? "USD").toUpperCase();
  const isPhysical    = upsell?.kind === "physical";
  const isSubscription = !isPhysical && upsell?.type === "SUBSCRIPTION";

  const payment = useSafePayment();
  const paypalRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady]     = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [a, setA] = useState<ShippingAddress>({
    name:       initialAddress?.name       ?? "",
    line1:      initialAddress?.line1      ?? "",
    line2:      initialAddress?.line2      ?? "",
    city:       initialAddress?.city       ?? "",
    state:      initialAddress?.state      ?? "",
    postalCode: initialAddress?.postalCode ?? "",
    country:    initialAddress?.country    ?? "US",
  });
  function set<K extends keyof ShippingAddress>(k: K, v: ShippingAddress[K]) {
    setA((prev) => ({ ...prev, [k]: v }));
  }
  // Refs that always point at the latest address / payment selection. The
  // PayPal Smart Buttons mount ONCE (no `a.*` in the effect deps) and read
  // from these refs at click time — otherwise every keystroke would teardown
  // + remount the buttons, producing a visible flicker.
  const addrRef    = useRef<ShippingAddress>(a);
  addrRef.current  = a;
  const paymentRef = useRef(payment);
  paymentRef.current = payment;

  function readAddressFrom(state: ShippingAddress): ShippingAddress | null {
    if (!state.name.trim() || !state.line1.trim() || !state.city.trim() || !state.postalCode.trim() || !state.country.trim()) return null;
    return {
      name: state.name.trim(),
      line1: state.line1.trim(),
      line2: state.line2?.trim() || undefined,
      city: state.city.trim(),
      state: state.state?.trim() || undefined,
      postalCode: state.postalCode.trim(),
      country: state.country.trim().toUpperCase(),
    };
  }
  function readAddress(): ShippingAddress | null {
    return readAddressFrom(a);
  }

  // ─── PayPal SDK loader ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showPayPal) return;
    if (!clientId) { setError("PayPal is not available."); return; }
    if (window.paypal) { setSdkReady(true); return; }
    const extra = isSubscription ? "&vault=true&intent=subscription" : "";
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=buttons&currency=${currency}${extra}`;
    script.onload  = () => setSdkReady(true);
    script.onerror = () => setError("Failed to load PayPal.");
    document.body.appendChild(script);
  }, [showPayPal, clientId, currency, isSubscription]);

  // ─── PayPal Smart Buttons render ──────────────────────────────────────────
  // Buttons mount ONCE per modal open. Address-typing must NOT be in deps —
  // tearing down + remounting on every keystroke produces a visible flicker.
  // Latest address / payment selection is read at click time via refs.
  useEffect(() => {
    if (!showPayPal || !sdkReady || !paypalRef.current || !window.paypal || !funnelStepId) return;
    if (!isPhysical && !upsell?.pricePlanId) return;
    if (isPhysical  && !upsell?.physicalProductId) return;
    paypalRef.current.innerHTML = "";

    const guardAddress = () => {
      if (!needsAddress) return true;
      const addr = readAddressFrom(addrRef.current);
      if (!addr) {
        setError("Please complete the shipping address above first.");
        return false;
      }
      return true;
    };

    const start = async (field: "paypalOrderId" | "paypalSubscriptionId") => {
      setProcessing(true);
      setError(null);
      const addr = needsAddress ? readAddressFrom(addrRef.current) : null;
      const sel  = paymentRef.current.physicalSelection;
      const body = isPhysical
        ? {
            funnelStepId,
            physicalProductId: upsell.physicalProductId,
            variantId:         sel.variantId,
            quantity:          sel.quantity,
            ...(addr ? { inlineShipTo: addr } : {}),
          }
        : { funnelStepId, pricePlanId: upsell.pricePlanId };
      const res  = await fetch("/api/checkout/upsell/paypal/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify(body),
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body:   JSON.stringify({ id }),
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
      onClick: (_d: any, actions: any) => guardAddress() ? actions.resolve() : actions.reject(),
      onCancel: () => setProcessing(false),
      onError:  (err: any) => { setProcessing(false); setError(err?.message ?? "PayPal error"); },
    };

    const config = isSubscription
      ? { ...common, createSubscription: () => start("paypalSubscriptionId"), onApprove: (d: any) => finish(d.subscriptionID) }
      : { ...common, createOrder:        () => start("paypalOrderId"),        onApprove: (d: any) => finish(d.orderID) };

    let buttons: any;
    let cancelled = false;
    try {
      buttons = window.paypal.Buttons(config);
      if (buttons.isEligible?.() === false) { setError("PayPal isn't available right now."); return; }
      Promise.resolve(buttons.render(paypalRef.current)).catch((err: any) => {
        if (!cancelled) console.warn("[upsell modal] paypal render failed", err);
      });
    } catch (err) {
      console.warn("[upsell modal] paypal init failed", err);
    }
    return () => {
      cancelled = true;
      try { buttons?.close?.(); } catch { /* already closed */ }
    };
    // Address fields intentionally excluded — see refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPayPal, sdkReady, needsAddress, isPhysical, isSubscription, funnelStepId]);

  // ─── Stripe "Continue with card" handler ──────────────────────────────────
  async function handleStripeConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (processing) return;
    const addr = needsAddress ? readAddress() : null;
    if (needsAddress && !addr) {
      setError("Please complete the shipping address above first.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const body = isPhysical
        ? {
            funnelStepId,
            physicalProductId: upsell.physicalProductId,
            variantId:         payment.physicalSelection.variantId,
            quantity:          payment.physicalSelection.quantity,
            ...(addr ? { inlineShipTo: addr } : {}),
          }
        : { funnelStepId, pricePlanId: upsell.pricePlanId };
      const res  = await fetch("/api/checkout/upsell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.success && json.nextStepUrl) {
        window.location.href = json.nextStepUrl;
        return;
      }
      // Stripe one-click still fell back → if PayPal is configured, leave the
      // modal open (PayPal section is already rendered when showPayPal=true).
      // Otherwise route to decline.
      if (json?.requiresPayment && upsell?.paypalClientId && showPayPal) {
        setProcessing(false);
        setError("Card payment isn't available right now — try PayPal below.");
        return;
      }
      const fallback = json?.declineUrl ?? upsell?.declineUrl ?? data?.nextStepUrl;
      if (fallback) window.location.href = fallback;
    } catch {
      setProcessing(false);
      setError("Something went wrong. Please try again.");
    }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1px solid #d1d5db", borderRadius: 8, outline: "none",
    background: "#fff", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#374151", marginBottom: 4, fontWeight: 500 };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 10px 40px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>Complete your purchase</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "#666" }}>×</button>
        </div>
        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 14 }}>
          {needsAddress
            ? "We'll use the card you saved at checkout — just need the delivery address."
            : "One-click charge isn't available — choose a payment option below."}
        </div>

        {/* ── Address form ── */}
        {needsAddress && (
          <form onSubmit={handleStripeConfirm}>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Full name</label>
              <input style={inputStyle} value={a.name} onChange={(e) => set("name", e.target.value)} required autoComplete="name" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Address line 1</label>
              <input style={inputStyle} value={a.line1} onChange={(e) => set("line1", e.target.value)} required autoComplete="address-line1" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Address line 2 <span style={{ color: "#9ca3af" }}>(optional)</span></label>
              <input style={inputStyle} value={a.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={a.city} onChange={(e) => set("city", e.target.value)} required autoComplete="address-level2" />
              </div>
              <div>
                <label style={labelStyle}>State / Region</label>
                <input style={inputStyle} value={a.state ?? ""} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Postal code</label>
                <input style={inputStyle} value={a.postalCode} onChange={(e) => set("postalCode", e.target.value)} required autoComplete="postal-code" />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <select
                  style={{ ...inputStyle, appearance: "none", paddingRight: 28, cursor: "pointer" }}
                  value={a.country}
                  onChange={(e) => set("country", e.target.value)}
                  required
                  autoComplete="country"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag ? `${c.flag} ` : ""}{c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{error}</div>}

            {/* Stripe submit lives inside the form so Enter submits. */}
            {showStripe && (
              <button
                type="submit"
                disabled={processing}
                style={{
                  width: "100%", padding: "12px 16px",
                  background: processing ? "#9ca3af" : "#111827", color: "#fff",
                  border: "none", borderRadius: 10, cursor: processing ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 600, marginBottom: showPayPal ? 12 : 0,
                }}
              >
                {processing ? "Processing…" : "Confirm with card"}
              </button>
            )}
          </form>
        )}

        {/* Stripe button shown standalone (no address form) — e.g. PayPal-only
            modal that also wants a Stripe try. Currently unused but harmless. */}
        {!needsAddress && showStripe && (
          <>
            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{error}</div>}
            <button
              onClick={(e) => handleStripeConfirm(e as any)}
              disabled={processing}
              style={{
                width: "100%", padding: "12px 16px",
                background: processing ? "#9ca3af" : "#111827", color: "#fff",
                border: "none", borderRadius: 10, cursor: processing ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 600, marginBottom: showPayPal ? 12 : 0,
              }}
            >
              {processing ? "Processing…" : "Confirm with card"}
            </button>
          </>
        )}

        {/* Divider between Stripe + PayPal when both are shown. */}
        {showStripe && showPayPal && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 12px", color: "#9ca3af", fontSize: 12 }}>
            <div style={{ flex: 1, borderTop: "1px solid #e5e7eb" }} />
            <span>or</span>
            <div style={{ flex: 1, borderTop: "1px solid #e5e7eb" }} />
          </div>
        )}

        {/* ── PayPal Smart Buttons ── */}
        {showPayPal && (
          <>
            {error && !needsAddress && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{error}</div>}
            {!sdkReady && !error && <div style={{ color: "#666", fontSize: 14, padding: "12px 0" }}>Loading PayPal…</div>}
            <div ref={paypalRef} style={{ minHeight: 45 }} />
            {processing && <div style={{ color: "#666", fontSize: 13, marginTop: 8, textAlign: "center" }}>Processing…</div>}
          </>
        )}
      </div>
    </div>
  );
}
