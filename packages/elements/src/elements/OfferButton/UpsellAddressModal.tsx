import React, { useState } from "react";
import countries from "../Field/countries.json";

// Inline shipping-address modal for the PHYSICAL upsell Accept flow. Used when
// the main checkout was DIGITAL — so the buyer's Order has no shippingAddress
// for us to reuse. The buyer fills this once on the upsell page and the parent
// (OfferButton) re-POSTs to /api/checkout/upsell with `inlineShipTo`.
//
// Self-contained: no styled-components, no context — same lightweight pattern
// as UpsellPayPalModal so it works in an editor preview too.

export type ShippingAddress = {
  name:        string;
  line1:       string;
  line2?:      string;
  city:        string;
  state?:      string;
  postalCode:  string;
  country:     string;
};

export function UpsellAddressModal({
  initial,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  initial?: Partial<ShippingAddress>;
  busy?: boolean;
  error?: string | null;
  onSubmit: (addr: ShippingAddress) => void;
  onClose:  () => void;
}) {
  const [a, setA] = useState<ShippingAddress>({
    name:       initial?.name       ?? "",
    line1:      initial?.line1      ?? "",
    line2:      initial?.line2      ?? "",
    city:       initial?.city       ?? "",
    state:      initial?.state      ?? "",
    postalCode: initial?.postalCode ?? "",
    country:    initial?.country    ?? "US",
  });

  function set<K extends keyof ShippingAddress>(k: K, v: ShippingAddress[K]) {
    setA((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Only the truly required pieces — keep it light so buyers don't bounce.
    if (!a.name.trim() || !a.line1.trim() || !a.city.trim() || !a.postalCode.trim() || !a.country.trim()) return;
    onSubmit({ ...a, name: a.name.trim(), line1: a.line1.trim(), line2: a.line2?.trim() || undefined, city: a.city.trim(), state: a.state?.trim() || undefined, postalCode: a.postalCode.trim(), country: a.country.trim() });
  }

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
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>Where should we ship this?</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "#666" }}>×</button>
        </div>
        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 14 }}>
          We&apos;ll use the card you saved at checkout — just need the delivery address.
        </div>

        <form onSubmit={handleSubmit}>
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

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%", padding: "12px 16px",
              background: busy ? "#9ca3af" : "#111827", color: "#fff",
              border: "none", borderRadius: 10, cursor: busy ? "not-allowed" : "pointer",
              fontSize: 14, fontWeight: 600,
            }}
          >
            {busy ? "Processing…" : "Confirm & charge"}
          </button>
        </form>
      </div>
    </div>
  );
}
