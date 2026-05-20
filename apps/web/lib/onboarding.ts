import { db } from "@launchtic/database";

// Onboarding checklist surfaced on the dashboard. Each item has a stable key
// (for analytics / dismiss persistence later), a label, a help blurb, and a
// link to the right Settings tab or feature page. Detection runs server-side
// against the workspace state — no per-user flag bookkeeping.

export type OnboardingItem = {
  key: "email" | "payment" | "ai" | "funnel";
  label: string;
  help: string;
  done: boolean;
  // Where the action button takes the operator. Either a Settings tab name
  // (`tab` for /settings?tab=...) or a relative route under the workspace
  // (`route` for /[workspaceSlug]/<route>).
  tab?:   "email" | "payment" | "ai-assistant";
  route?: string;
  cta:    string;
};

export type OnboardingStatus = {
  items: OnboardingItem[];
  completed: number;
  total: number;
  isComplete: boolean;
  isDismissed: boolean;
};

export async function getOnboardingStatus(workspaceId: string): Promise<OnboardingStatus> {
  const [settings, senderCount, funnelCount] = await Promise.all([
    db.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { smtp: true, stripe: true, paypal: true, ai: true, onboardingDismissed: true },
    }),
    db.senderIdentity.count({ where: { workspaceId } }),
    db.funnel.count({ where: { workspaceId } }),
  ]);

  const hasSmtp   = !!(settings?.smtp   as any)?.host;
  const hasStripe = !!(settings?.stripe as any)?.publishableKey;
  const hasPaypal = !!(settings?.paypal as any)?.clientId;
  const hasAiKey  = !!(settings?.ai     as any)?.apiKey;

  const items: OnboardingItem[] = [
    {
      key:   "email",
      label: "Configure SMTP & sender",
      help:  "Two-step setup required to send order confirmations, broadcasts, and automation emails. First connect your SMTP server credentials, then verify at least one sender (from) email address.",
      done:  hasSmtp && senderCount > 0,
      tab:   "email",
      cta:   "Configure",
    },
    {
      key:   "payment",
      label: "Connect Stripe or PayPal",
      help:  "Required to accept payments on checkout steps. Connect Stripe (recommended) or PayPal — you only need one to publish a paid funnel.",
      done:  hasStripe || hasPaypal,
      tab:   "payment",
      cta:   "Configure",
    },
    {
      key:   "ai",
      label: "Configure AI Assistant",
      help:  "Let the assistant build for you — generate landing-page copy, fill templates, scaffold complete funnels, draft email sequences, and write broadcasts from a one-line description. Bring your own API key for Claude, ChatGPT, DeepSeek, or Gemini.",
      done:  hasAiKey,
      tab:   "ai-assistant",
      cta:   "Configure",
    },
    {
      key:   "funnel",
      label: "Create your first funnel",
      help:  "The final step — combine templates into a complete customer journey: opt-in → sales → checkout → thank-you. Pick from the seeded templates to start fast, or let the AI Assistant scaffold the whole funnel from a one-line description of your business.",
      done:  funnelCount > 0,
      route: "funnels",
      cta:   "Start",
    },
  ];

  const completed = items.filter((i) => i.done).length;
  return {
    items,
    completed,
    total: items.length,
    isComplete:  completed === items.length,
    isDismissed: !!settings?.onboardingDismissed,
  };
}
