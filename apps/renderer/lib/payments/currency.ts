// Currency unit handling.
//
// DB convention: amounts are always stored multiplied by 100 (cents-equivalent), even for
// zero-decimal currencies like JPY. This keeps the schema/integer math consistent.
// At the payment-provider boundary we convert to/from the provider's expected units.

import { SUPPORTED_CURRENCY_CODES } from "@launchtic/types";

// Stripe's zero-decimal list — broader than what we surface to users (kept for math
// correctness on any legacy / future-supported zero-decimal currency).
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "IDR", "IRR", "LAK",
]);

// PayPal-supported subset. Derived from the shared SUPPORTED_CURRENCY_CODES, which
// is the Stripe ∩ PayPal intersection — a single source of truth for the whole app.
const PAYPAL_CURRENCIES = new Set(SUPPORTED_CURRENCY_CODES.map(c => c.toUpperCase()));

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toUpperCase());
}

export function decimalsFor(currency: string): number {
  return isZeroDecimal(currency) ? 0 : 2;
}

export function isPaypalSupported(currency: string): boolean {
  return PAYPAL_CURRENCIES.has(currency.toUpperCase());
}

// Convert our DB amount (always ×100) → smallest unit expected by provider.
// USD: 30000 (=$300) → 30000 (no change).
// JPY: 3000000 (=¥30,000 in our convention) → 30000 (¥30,000 in Stripe convention).
export function toProviderAmount(amount: number, currency: string): number {
  return isZeroDecimal(currency) ? Math.round(amount / 100) : amount;
}

// Inverse: provider's smallest unit → our DB convention (×100).
// Use when storing webhook-incoming amounts.
export function fromProviderAmount(amount: number, currency: string): number {
  return isZeroDecimal(currency) ? amount * 100 : amount;
}

// Format amount as decimal string for PayPal API (which takes string).
// USD: 30000 → "300.00". JPY: 3000000 → "30000".
export function formatAmountForApi(amount: number, currency: string): string {
  const decimals = decimalsFor(currency);
  return (amount / 100).toFixed(decimals);
}
