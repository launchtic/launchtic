// ─────────────────────────────────────────
// Currencies — intersection of Stripe + PayPal support (~25)
// Stripe supports 135+; PayPal is the bottleneck.
// Codes are stored lowercase in DB; uppercase only at provider boundary.
// ─────────────────────────────────────────

export type SupportedCurrency = {
  code: string;   // lowercase, e.g. "usd"
  label: string;  // display, e.g. "USD — US Dollar"
  zeroDecimal: boolean; // true for JPY/KRW etc. — affects amount conversion
};

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: "usd", label: "USD — US Dollar",          zeroDecimal: false },
  { code: "eur", label: "EUR — Euro",               zeroDecimal: false },
  { code: "gbp", label: "GBP — British Pound",      zeroDecimal: false },
  { code: "aud", label: "AUD — Australian Dollar",  zeroDecimal: false },
  { code: "cad", label: "CAD — Canadian Dollar",    zeroDecimal: false },
  { code: "chf", label: "CHF — Swiss Franc",        zeroDecimal: false },
  { code: "sgd", label: "SGD — Singapore Dollar",   zeroDecimal: false },
  { code: "hkd", label: "HKD — Hong Kong Dollar",   zeroDecimal: false },
  { code: "nzd", label: "NZD — New Zealand Dollar", zeroDecimal: false },
  { code: "jpy", label: "JPY — Japanese Yen",       zeroDecimal: true  },
  { code: "cny", label: "CNY — Chinese Yuan",       zeroDecimal: false },
  { code: "twd", label: "TWD — Taiwan Dollar",      zeroDecimal: false },
  { code: "myr", label: "MYR — Malaysian Ringgit",  zeroDecimal: false },
  { code: "thb", label: "THB — Thai Baht",          zeroDecimal: false },
  { code: "php", label: "PHP — Philippine Peso",    zeroDecimal: false },
  { code: "ils", label: "ILS — Israeli Shekel",     zeroDecimal: false },
  { code: "brl", label: "BRL — Brazilian Real",     zeroDecimal: false },
  { code: "mxn", label: "MXN — Mexican Peso",       zeroDecimal: false },
  { code: "czk", label: "CZK — Czech Koruna",       zeroDecimal: false },
  { code: "dkk", label: "DKK — Danish Krone",       zeroDecimal: false },
  { code: "nok", label: "NOK — Norwegian Krone",    zeroDecimal: false },
  { code: "sek", label: "SEK — Swedish Krona",      zeroDecimal: false },
  { code: "pln", label: "PLN — Polish Zloty",       zeroDecimal: false },
  { code: "huf", label: "HUF — Hungarian Forint",   zeroDecimal: false },
  { code: "rub", label: "RUB — Russian Ruble",      zeroDecimal: false },
];

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code);

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCY_CODES.includes(code.toLowerCase());
}

// ─────────────────────────────────────────
// API Response wrappers
// ─────────────────────────────────────────

export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  code?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ─────────────────────────────────────────
// Craft.js Page JSON
// ─────────────────────────────────────────

export type CraftNodeData = {
  type: { resolvedName: string } | string;
  isCanvas?: boolean;
  props: Record<string, unknown>;
  displayName?: string;
  custom?: Record<string, unknown>;
  parent?: string;
  hidden?: boolean;
  nodes?: string[];
  linkedNodes?: Record<string, string>;
};

export type CraftPageJson = {
  ROOT: CraftNodeData;
  [nodeId: string]: CraftNodeData;
};

// ─────────────────────────────────────────
// Payment
// ─────────────────────────────────────────

export type PaymentMethod = "stripe" | "paypal";

export type PhysicalProductData = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  price: number;        // cents
  currency: string;
  options: Array<{ id: string; name: string; values: string[] }>;
  variants: Array<{
    id: string;
    name: string;
    combination: string[];
    sku: string | null;
    price: number | null; // cents, null = use base price
    image: string | null;
  }>;
};

export type OrderBumpPricePlanData = {
  id: string;
  name: string;
  type: string;
  amount: number; // cents
  currency: string;
  interval?: string | null;
  trialDays?: number | null;
};

export type PaymentData = {
  paymentMethods: PaymentMethod[];
  stripePublicKey?: string;
  stripeConnectedAccountId?: string;
  paypalClientId?: string | null;
  paypalMode?: "sandbox" | "live";
  currency: string;
  offer: {
    pricePlans: PricePlanData[];
  };
  checkedPlanId: string;
  selectedPaymentMethod: PaymentMethod | null;
  physicalProduct?: PhysicalProductData;
  shippingFee?: number;
  orderBumps?: OrderBumpData[];
};

export type PricePlanData = {
  id: string;
  name: string;
  description?: string;
  type: "ONE_TIME" | "SUBSCRIPTION" | "FREE_TRIAL";
  directChargeAmount: number; // cents
  currency: string;
  interval?: string;
  trialDays?: number;
};

export type OrderBumpData = {
  id: string;
  label: string;
  headline: string | null;
  offerType: "DIGITAL" | "PHYSICAL" | null;
  shippingFee: number;
  pricePlan: OrderBumpPricePlanData | null;
  physicalProduct: { id: string; name: string; price: number; currency: string } | null;
};

// ─────────────────────────────────────────
// Renderer — data returned for the published page
// ─────────────────────────────────────────

export type RendererPageData = {
  workspaceId: string;
  funnelId: string;
  funnelStepId: string;
  nextStepUrl: string | null;
  pageJson: CraftPageJson;
  payment?: PaymentData;
  meta?: Record<string, unknown> | null;
};

// ─────────────────────────────────────────
// Form submission
// ─────────────────────────────────────────

export type FormFieldData = {
  name: string;
  type: string;
  required: boolean;
  value?: string;
};

export type PaymentFormPayload = {
  customer: {
    fields: Record<string, string>; // { first_name, last_name, email, phone }
  };
  product: {
    pricePlanId: string;
    quantity: number;
  };
  orderBumpIds?: string[];
  paymentMethod: PaymentMethod;
  couponCode?: string;
};

// ─────────────────────────────────────────
// Automation Flow (React Flow)
// ─────────────────────────────────────────

export type FlowNodeType =
  | "trigger"
  | "condition"
  | "action"
  | "delay"
  | "split";

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type AutomationFlow = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

// ─────────────────────────────────────────
// SMTP
// ─────────────────────────────────────────

export type SmtpProvider = "SES" | "SENDGRID" | "MAILGUN" | "POSTMARK" | "CUSTOM";

export type SmtpConfigInput = {
  provider: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string; // plain — encrypted before being saved to DB
  fromEmail: string;
  fromName: string;
  maxPerSecond?: number;
  maxPerDay?: number;
};
