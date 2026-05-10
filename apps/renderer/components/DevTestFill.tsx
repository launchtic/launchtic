"use client";

// In production this component renders nothing — see the early-return in the
// default export below. Do NOT swap the module export with a no-op here:
// `module.exports = ...` at top level of a "use client" file generates a
// webpack `c.hmd(a).exports = {...}` wrapper that Next.js 15's ESM server
// runtime rejects with "ES Modules may not assign module.exports".

const TEST_DATA: Record<string, string> = {
  email:          "jane.smith@company.com",
  firstName:      "Jane",
  lastName:       "Smith",
  phone:          "+1 2025551234",
  streetAddress:  "456 Main Street",
  streetNumber:   "456",
  neighborhood:   "Downtown",
  postalCode:     "90210",
  city:           "Los Angeles",
  stateProvince:  "California",
  country:        "US",          // country code for <select>
  companyName:    "TechStartup Inc",
  taxNumber:      "123456789",
};

function fillInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  if (!setter) return;
  setter.call(el, value);
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillSelect(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value"
  )?.set;
  if (!setter) return;
  setter.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function autoFill() {
  Object.entries(TEST_DATA).forEach(([name, value]) => {
    // Try input elements first
    const inputs = document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
    inputs.forEach((el) => fillInput(el, value));

    // Try select elements
    const selects = document.querySelectorAll<HTMLSelectElement>(`select[name="${name}"]`);
    selects.forEach((el) => fillSelect(el, value));
  });
}

export default function DevTestFill() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <button
      onClick={autoFill}
      title="Auto-fill test data (dev only)"
      style={{
        position:     "fixed",
        bottom:       "16px",
        right:        "16px",
        zIndex:       9999,
        padding:      "6px 12px",
        fontSize:     "11px",
        fontWeight:   600,
        color:        "#fff",
        background:   "rgba(99, 102, 241, 0.85)",
        border:       "none",
        borderRadius: "20px",
        cursor:       "pointer",
        backdropFilter: "blur(4px)",
        boxShadow:    "0 2px 8px rgba(0,0,0,0.25)",
        letterSpacing: "0.02em",
      }}
    >
      🧪 Fill test data
    </button>
  );
}
