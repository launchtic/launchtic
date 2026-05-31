// Workflow templates — pre-built graphs operators can clone in one click.
// Each template ships with nodes, edges, default trigger + reasonable copy
// for SEND_EMAIL bodies (operator customizes after clone).
//
// Categories: "Sales" / "Onboarding" / "Re-engagement" / "Retention" / "Tagging"
// Icons: lucide-react names (rendered by TemplateGallery)
// Badge: optional banner — "Flagship" / "Popular" / "New"

export type TemplateNode = {
  id:       string;
  type:     "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK" | "DELAY" | "CONDITION" | "SPLIT" | "END";
  position?: { x: number; y: number };
  config?:  Record<string, unknown>;
};

export type TemplateEdge = {
  id:     string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
};

export type WorkflowTemplate = {
  id:           string;
  name:         string;
  description:  string;
  category:     "Sales" | "Onboarding" | "Re-engagement" | "Retention" | "Tagging" | "Rules";
  icon:         string; // lucide icon name
  badge?:       "Flagship" | "Popular" | "New";
  triggerType:  string;
  triggerConfig: Record<string, unknown>;
  reEnrollPolicy: "SINGLE_ACTIVE" | "ALWAYS" | "COOLDOWN";
  reEnrollCooldownDays?: number;
  nodes:        TemplateNode[];
  edges:        TemplateEdge[];
  startNodeId:  string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
// Position model: every node placed on a grid. `row` (idx) → y, `col` → x
// offset from center. Linear flows use col=0 (default). Branched flows
// (CONDITION → true/false) use col=-1 / +1 to split paths left/right
// so the canvas reads as a tree, not a stacked column.

// Y_STEP must be ≥ node card height (~70px) + arrow gap + edge label space.
// 150 leaves a clean 80px vertical edge, enough room for the smoothstep curve
// and the optional true/false chip on CONDITION/GOAL outputs.
const Y_STEP = 150;
const X_STEP = 280;
const X_CENTER = 360;

function y(i: number) { return 160 + i * Y_STEP; }
function x(col: number = 0) { return X_CENTER + col * X_STEP; }

function emailNode(id: string, idx: number, subject: string, bodyHtml: string, col = 0): TemplateNode {
  return {
    id, type: "SEND_EMAIL", position: { x: x(col), y: y(idx) },
    config: { subject, bodyHtml, fromName: "", fromEmail: "" },
  };
}
function delayNode(id: string, idx: number, hours: number, col = 0): TemplateNode {
  return { id, type: "DELAY", position: { x: x(col), y: y(idx) }, config: { hours } };
}
function delayDays(id: string, idx: number, days: number, col = 0): TemplateNode {
  return { id, type: "DELAY", position: { x: x(col), y: y(idx) }, config: { days } };
}
function tagNode(id: string, idx: number, kind: "ADD_TAG" | "REMOVE_TAG", col = 0): TemplateNode {
  return { id, type: kind, position: { x: x(col), y: y(idx) }, config: { tagId: "" } };
}
function condTag(id: string, idx: number, col = 0): TemplateNode {
  return { id, type: "CONDITION", position: { x: x(col), y: y(idx) }, config: { kind: "contact_has_tag", tagId: "" } };
}
function condAmount(id: string, idx: number, gte: number, col = 0): TemplateNode {
  return { id, type: "CONDITION", position: { x: x(col), y: y(idx) }, config: { kind: "trigger_amount", operator: "gte", value: gte } };
}
// Early-exit pattern: CONDITION (kind: contact_completed_purchase) → true branch
// → End node with config.reason. Replaces the old Goal node.
function condPurchase(id: string, idx: number, col = 0): TemplateNode {
  return { id, type: "CONDITION", position: { x: x(col), y: y(idx) }, config: { kind: "contact_completed_purchase" } };
}
function endNode(id: string, idx: number, col = 0, reason?: string): TemplateNode {
  return {
    id, type: "END", position: { x: x(col), y: y(idx) },
    ...(reason ? { config: { reason } } : {}),
  };
}
function webhookNode(id: string, idx: number, url: string, col = 0): TemplateNode {
  return { id, type: "WEBHOOK", position: { x: x(col), y: y(idx) }, config: { url, method: "POST" } };
}
function edge(id: string, source: string, target: string, label?: string): TemplateEdge {
  return { id, source, target, label };
}

// ─── Templates ──────────────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [

  // ─── 1. Cart Abandonment 3-step (Flagship) ───────────────────────────────
  // Industry standard: 1h gentle reminder → 24h urgency → 72h discount/last call.
  // Each step is gated by an If/else node checking `contact_completed_purchase`.
  // When true → routed to an End node with reason="purchased" so the run exits
  // (run.exitReason captures this for analytics) without sending the next email.
  {
    id: "cart_abandonment_3step",
    name: "Cart Abandonment Recovery (3-step)",
    description: "Win back lost revenue: 1h → 24h → 72h recovery emails with auto-exit when the buyer completes.",
    category: "Sales",
    icon: "ShoppingCart",
    badge: "Flagship",
    triggerType: "CHECKOUT_STARTED",
    triggerConfig: {},
    reEnrollPolicy: "COOLDOWN",
    reEnrollCooldownDays: 7,
    startNodeId: "delay1",
    nodes: [
      delayNode("delay1", 0, 1),
      condPurchase("cond1", 1),
      endNode("end1", 2, -1, "purchased"),
      emailNode("email1", 2,
        "{{contact.firstName}}, did you forget something?",
        `<p>Hi {{contact.firstName}},</p>
<p>You were so close to grabbing something great — and then life got in the way. Totally understandable.</p>
<p>Your cart is still here, waiting:</p>
<p><a href="#" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Complete your order →</a></p>
<p>Questions? Just hit reply.</p>`),
      delayNode("delay2", 3, 23),
      condPurchase("cond2", 4),
      endNode("end2", 5, -1, "purchased"),
      emailNode("email2", 5,
        "Still thinking it over, {{contact.firstName}}?",
        `<p>Hi {{contact.firstName}},</p>
<p>No pressure — just a heads up that hundreds of other folks grabbed theirs this week.</p>
<p>If you've got questions about how it works, what's included, or whether it's the right fit, hit reply and a real human will get back to you within the hour.</p>
<p><a href="#" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Pick up where you left off →</a></p>`),
      delayNode("delay3", 6, 48),
      condPurchase("cond3", 7),
      endNode("end3", 8, -1, "purchased"),
      emailNode("email3", 8,
        "Last chance — here's 10% off",
        `<p>{{contact.firstName}}, this is the last one of these emails — promise.</p>
<p>If price was the holdup, here's <strong>10% off</strong> if you complete in the next 24 hours. Use code <code>COMEBACK10</code> at checkout:</p>
<p><a href="#" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Claim 10% off →</a></p>
<p>After today, no more nudges. Cart will expire.</p>`),
      endNode("end_final", 9),
    ],
    edges: [
      edge("e1",  "delay1", "cond1"),
      edge("e2",  "cond1",  "end1",   "true"),
      edge("e3",  "cond1",  "email1", "false"),
      edge("e4",  "email1", "delay2"),
      edge("e5",  "delay2", "cond2"),
      edge("e6",  "cond2",  "end2",   "true"),
      edge("e7",  "cond2",  "email2", "false"),
      edge("e8",  "email2", "delay3"),
      edge("e9",  "delay3", "cond3"),
      edge("e10", "cond3",  "end3",   "true"),
      edge("e11", "cond3",  "email3", "false"),
      edge("e12", "email3", "end_final"),
    ],
  },

  // ─── 2. Welcome Series ───────────────────────────────────────────────────
  {
    id: "welcome_series_3",
    name: "Welcome Series (3 emails)",
    description: "Onboard new subscribers with a value-first sequence: intro → story → first action.",
    category: "Onboarding",
    icon: "Mail",
    badge: "Popular",
    triggerType: "FORM_SUBMIT",
    triggerConfig: {},
    reEnrollPolicy: "SINGLE_ACTIVE",
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "Welcome, {{contact.firstName}}! Here's what to expect…",
        `<p>Hi {{contact.firstName}},</p>
<p>Glad you're here. Quick rundown of what I'll be sending your way:</p>
<ul><li>Practical tips you can actually use</li><li>Behind-the-scenes from {{workspace.name}}</li><li>Occasional offers (always optional)</li></ul>
<p>Reply with what you're hoping to get out of this — I read every email.</p>`),
      delayNode("delay1", 1, 48),
      emailNode("email2", 2,
        "The story behind {{workspace.name}}",
        `<p>Hi {{contact.firstName}},</p>
<p>Quick story about why this exists…</p>
<p>[Customize: why you started, who you're for, what problem you solve]</p>
<p>Hit reply and tell me yours.</p>`),
      delayDays("delay2", 3, 3),
      emailNode("email3", 4,
        "One simple action to get started today",
        `<p>Hi {{contact.firstName}},</p>
<p>Knowing is half the battle — doing is the other half. Today's tiny action:</p>
<p>[Customize: one concrete, 5-minute thing they can do]</p>
<p>Let me know how it goes.</p>`),
      endNode("end", 5),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "delay2"),
      edge("e4", "delay2", "email3"),
      edge("e5", "email3", "end"),
    ],
  },

  // ─── 3. Post-purchase Thank You + Onboarding ─────────────────────────────
  {
    id: "post_purchase_onboarding",
    name: "Post-purchase Thank You",
    description: "Reduce buyer's remorse: instant thanks → setup help (24h) → tip and ask for review (7d).",
    category: "Onboarding",
    icon: "PackageCheck",
    badge: "Popular",
    triggerType: "NEW_SALE",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "Thanks for your order, {{contact.firstName}}!",
        `<p>Hi {{contact.firstName}},</p>
<p>Just wanted to say thank you. Your order is confirmed and we'll be in touch shortly with next steps.</p>
<p>If you've got any questions in the meantime, hit reply — we're here.</p>`),
      delayNode("delay1", 1, 24),
      emailNode("email2", 2,
        "Getting started: 3 things to know",
        `<p>Hi {{contact.firstName}},</p>
<p>Quick wins for your first day:</p>
<ol><li>[Customize step 1]</li><li>[Customize step 2]</li><li>[Customize step 3]</li></ol>
<p>Reply if you get stuck — happy to help.</p>`),
      delayDays("delay2", 3, 7),
      emailNode("email3", 4,
        "How's it going so far?",
        `<p>Hi {{contact.firstName}},</p>
<p>Been a week — how's it going?</p>
<p>If you've had a good experience, a quick review would mean a lot: [review link]</p>
<p>If something's off, reply and let me know.</p>`),
      endNode("end", 5),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "delay2"),
      edge("e4", "delay2", "email3"),
      edge("e5", "email3", "end"),
    ],
  },

  // ─── 4. VIP Customer Track ───────────────────────────────────────────────
  // CONDITION node: if order total ≥ $500 → tag + special thanks. Otherwise normal flow.
  {
    id: "vip_customer_track",
    name: "VIP Customer Track",
    description: "Tag high-value buyers ($500+) and send a personal note. Smaller orders get a standard thanks.",
    category: "Sales",
    icon: "Crown",
    triggerType: "NEW_SALE",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "cond1",
    nodes: [
      condAmount("cond1", 0, 50000), // $500.00 in cents — center column
      // TRUE branch (left): VIP tag → personal email → end
      tagNode("tag_vip", 1, "ADD_TAG", -1),
      emailNode("email_vip", 2,
        "{{contact.firstName}}, welcome to the VIP list",
        `<p>Hi {{contact.firstName}},</p>
<p>I wanted to thank you personally — your order is one of our biggest this week, and that means a lot.</p>
<p>I've added you to a small list of best customers we'll keep in the loop with early access and special perks.</p>
<p>If there's ever anything you need, my email is right here. Reply anytime.</p>`, -1),
      endNode("end_vip", 3, -1),
      // FALSE branch (right): standard thanks → end
      emailNode("email_std", 1,
        "Thanks for your order!",
        `<p>Hi {{contact.firstName}},</p>
<p>Thanks for your order — confirmation details coming soon.</p>`, 1),
      endNode("end_std", 2, 1),
    ],
    edges: [
      edge("e1", "cond1", "tag_vip",   "true"),
      edge("e2", "cond1", "email_std", "false"),
      edge("e3", "tag_vip", "email_vip"),
      edge("e4", "email_vip", "end_vip"),
      edge("e5", "email_std", "end_std"),
    ],
  },

  // ─── 5. Refund Follow-up ─────────────────────────────────────────────────
  {
    id: "refund_followup",
    name: "Refund Follow-up",
    description: "Recover the relationship: empathetic refund confirmation + 14d re-engagement offer.",
    category: "Retention",
    icon: "Undo2",
    triggerType: "SALE_CANCELED",
    triggerConfig: {},
    reEnrollPolicy: "COOLDOWN",
    reEnrollCooldownDays: 30,
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "Your refund is processing, {{contact.firstName}}",
        `<p>Hi {{contact.firstName}},</p>
<p>Your refund is on its way. You should see it in your account within 5-10 business days.</p>
<p>If there's anything we could have done differently, I'd really appreciate hearing it — just hit reply.</p>`),
      delayDays("delay1", 1, 14),
      emailNode("email2", 2,
        "Open to giving us another shot?",
        `<p>Hi {{contact.firstName}},</p>
<p>It's been two weeks — wanted to circle back.</p>
<p>If timing or fit was the issue, we've shipped some improvements since. Here's 15% off if you'd like to try again: <code>SECONDCHANCE15</code></p>
<p>If you'd rather not hear from us, just hit reply and I'll take you off the list myself.</p>`),
      endNode("end", 3),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "end"),
    ],
  },

  // ─── 6. Failed Payment Grace Period ──────────────────────────────────────
  {
    id: "failed_payment_grace",
    name: "Failed Payment Grace",
    description: "Recover subscription churn: nudge at 0h → reminder at 48h → final warning at 5d.",
    category: "Retention",
    icon: "AlertTriangle",
    triggerType: "SUBSCRIPTION_PAYMENT_FAILED",
    triggerConfig: {},
    reEnrollPolicy: "SINGLE_ACTIVE",
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "We couldn't process your payment",
        `<p>Hi {{contact.firstName}},</p>
<p>Our payment processor couldn't charge your card on file — usually that means the card expired or the bank flagged it.</p>
<p>Update payment in 2 minutes: <a href="#" style="color:#2563eb">Update card →</a></p>
<p>We'll retry automatically once you update. No action needed beyond that.</p>`),
      delayDays("delay1", 1, 2),
      emailNode("email2", 2,
        "Quick reminder: payment still pending",
        `<p>Hi {{contact.firstName}},</p>
<p>Your subscription is paused while we sort out the payment. If you need a moment, no rush — just wanted to make sure this didn't slip through.</p>
<p><a href="#" style="color:#2563eb">Update card →</a></p>`),
      delayDays("delay2", 3, 3),
      emailNode("email3", 4,
        "Final notice: cancellation in 24h",
        `<p>Hi {{contact.firstName}},</p>
<p>If we can't process payment in the next 24 hours your subscription will be canceled. Once canceled, you'll lose access to everything you've built.</p>
<p>One click to save it: <a href="#" style="color:#dc2626;font-weight:600">Update card now →</a></p>`),
      endNode("end", 5),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "delay2"),
      edge("e4", "delay2", "email3"),
      edge("e5", "email3", "end"),
    ],
  },

  // ─── 7. Re-engagement (Tag-driven) ───────────────────────────────────────
  {
    id: "reengagement_dormant",
    name: "Re-engagement Sequence",
    description: "Win back dormant subscribers with a 3-email reactivation flow (triggered by manual tag).",
    category: "Re-engagement",
    icon: "Heart",
    triggerType: "TAG_ADDED",
    triggerConfig: {},
    reEnrollPolicy: "COOLDOWN",
    reEnrollCooldownDays: 60,
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "{{contact.firstName}}, still want to hear from us?",
        `<p>Hi {{contact.firstName}},</p>
<p>It's been a while since you opened one of our emails — totally fine if your interests have changed.</p>
<p>If you'd like to keep getting these, no action needed.</p>
<p>If you'd rather not, no hard feelings: <a href="#">unsubscribe in one click →</a></p>`),
      delayDays("delay1", 1, 5),
      emailNode("email2", 2,
        "Here's what you've missed",
        `<p>Hi {{contact.firstName}},</p>
<p>Quick recap of recent highlights:</p>
<ul><li>[Customize: recent post / product / story]</li><li>[Customize: another one]</li><li>[Customize: third one]</li></ul>`),
      delayDays("delay2", 3, 5),
      emailNode("email3", 4,
        "Last email if no reply",
        `<p>Hi {{contact.firstName}},</p>
<p>Haven't heard back so I'll stop reaching out after this one.</p>
<p>If we cross paths again — door's always open.</p>`),
      endNode("end", 5),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "delay2"),
      edge("e4", "delay2", "email3"),
      edge("e5", "email3", "end"),
    ],
  },

  // ─── 8. Tag-based Onboarding (Path Branch) ───────────────────────────────
  {
    id: "tag_segment_branch",
    name: "Segment-Specific Onboarding",
    description: "Split contacts into two onboarding paths based on whether they have a tag (e.g., trial vs. paid).",
    category: "Tagging",
    icon: "Split",
    triggerType: "TAG_ADDED",
    triggerConfig: {},
    reEnrollPolicy: "SINGLE_ACTIVE",
    startNodeId: "cond1",
    nodes: [
      condTag("cond1", 0), // center column
      // TRUE branch (left): has the tag → paid welcome
      emailNode("email_paid", 1,
        "Welcome to the paid plan!",
        `<p>Hi {{contact.firstName}},</p>
<p>Your paid plan is active. Here's everything that's now unlocked: [customize]</p>`, -1),
      endNode("end_paid", 2, -1),
      // FALSE branch (right): no tag → trial flow
      emailNode("email_trial", 1,
        "Your trial is rolling — here's how to get the most out of it",
        `<p>Hi {{contact.firstName}},</p>
<p>Quick tour of trial features: [customize]</p>
<p>If you have questions, hit reply.</p>`, 1),
      endNode("end_trial", 2, 1),
    ],
    edges: [
      edge("e1", "cond1", "email_paid",  "true"),
      edge("e2", "cond1", "email_trial", "false"),
      edge("e3", "email_paid",  "end_paid"),
      edge("e4", "email_trial", "end_trial"),
    ],
  },

  // ─── 9. Email Engagement Booster ─────────────────────────────────────────
  {
    id: "email_engagement_booster",
    name: "Engaged Reader Tagger",
    description: "When a contact clicks a link in your email, tag them as engaged + send a follow-up offer in 24h.",
    category: "Tagging",
    icon: "MousePointerClick",
    triggerType: "EMAIL_LINK_CLICKED",
    triggerConfig: {},
    reEnrollPolicy: "SINGLE_ACTIVE",
    startNodeId: "tag1",
    nodes: [
      tagNode("tag1", 0, "ADD_TAG"),
      delayNode("delay1", 1, 24),
      emailNode("email1", 2,
        "Saw you clicked — want to go deeper?",
        `<p>Hi {{contact.firstName}},</p>
<p>Noticed you clicked through to [customize]. Since you're interested, here's a related read that goes deeper: [customize link]</p>
<p>Reply if you have questions.</p>`),
      endNode("end", 3),
    ],
    edges: [
      edge("e1", "tag1", "delay1"),
      edge("e2", "delay1", "email1"),
      edge("e3", "email1", "end"),
    ],
  },

  // ─── 10. Lead Magnet Delivery ────────────────────────────────────────────
  {
    id: "lead_magnet_delivery",
    name: "Lead Magnet Delivery",
    description: "Deliver a downloadable lead magnet immediately + remind in 3 days if they haven't engaged.",
    category: "Onboarding",
    icon: "Gift",
    badge: "New",
    triggerType: "FORM_SUBMIT",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "email1",
    nodes: [
      emailNode("email1", 0,
        "Here's your download, {{contact.firstName}}",
        `<p>Hi {{contact.firstName}},</p>
<p>Here's the resource you signed up for:</p>
<p><a href="#" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Download now →</a></p>
<p>If you have trouble accessing it, just reply.</p>`),
      delayDays("delay1", 1, 3),
      emailNode("email2", 2,
        "Got a chance to look through it?",
        `<p>Hi {{contact.firstName}},</p>
<p>Wanted to check in — did the [customize: resource name] land well? If something didn't click or you got stuck, hit reply and I'll point you in the right direction.</p>`),
      endNode("end", 3),
    ],
    edges: [
      edge("e1", "email1", "delay1"),
      edge("e2", "delay1", "email2"),
      edge("e3", "email2", "end"),
    ],
  },

  // ─── Quick Rules ─────────────────────────────────────────────────────────
  // Single-action workflows that replace "automation rules" in other tools
  // (Klaviyo/HubSpot/Mailchimp). Each is 2-3 nodes — clone, pick the tag/URL,
  // activate. No editing copy required.

  // ─── 11. Quick Rule: Auto-tag form leads ─────────────────────────────────
  {
    id: "rule_autotag_form_lead",
    name: "Quick Rule — Auto-tag form leads",
    description: "Every contact who submits a form gets a tag. Filter the trigger by funnel to scope to one campaign.",
    category: "Rules",
    icon: "TagPlus",
    badge: "New",
    triggerType: "FORM_SUBMIT",
    triggerConfig: {},
    reEnrollPolicy: "SINGLE_ACTIVE",
    startNodeId: "tag1",
    nodes: [
      tagNode("tag1", 0, "ADD_TAG"),
      endNode("end", 1),
    ],
    edges: [
      edge("e1", "tag1", "end"),
    ],
  },

  // ─── 12. Quick Rule: Webhook alert on high-value sale ────────────────────
  {
    id: "rule_webhook_big_sale",
    name: "Quick Rule — Slack/CRM alert on $500+ sale",
    description: "Ping any HTTP endpoint (Slack incoming webhook, Zapier, custom CRM) when a sale ≥ $500 closes.",
    category: "Rules",
    icon: "Bell",
    badge: "New",
    triggerType: "NEW_SALE",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "cond1",
    nodes: [
      condAmount("cond1", 0, 50000), // $500.00 in cents
      webhookNode("webhook1", 1, "https://hooks.slack.com/services/REPLACE_ME", -1),
      endNode("end_hit", 2, -1),
      endNode("end_skip", 1, 1),
    ],
    edges: [
      edge("e1", "cond1", "webhook1", "true"),
      edge("e2", "cond1", "end_skip", "false"),
      edge("e3", "webhook1", "end_hit"),
    ],
  },

  // ─── 13. Quick Rule: Trial → Paid tag swap ───────────────────────────────
  {
    id: "rule_upgrade_tag_swap",
    name: "Quick Rule — Trial → Paid tag swap",
    description: "When someone buys, remove their `trial` tag and add `paid-customer`. Keeps your segments clean.",
    category: "Rules",
    icon: "ArrowUpCircle",
    triggerType: "NEW_SALE",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "remove1",
    nodes: [
      tagNode("remove1", 0, "REMOVE_TAG"),
      tagNode("add1", 1, "ADD_TAG"),
      endNode("end", 2),
    ],
    edges: [
      edge("e1", "remove1", "add1"),
      edge("e2", "add1", "end"),
    ],
  },

  // ─── 14. Quick Rule: Refund cleanup ──────────────────────────────────────
  {
    id: "rule_refund_cleanup",
    name: "Quick Rule — Refund cleanup",
    description: "On refund: remove `customer` tag, add `refunded`. Use this to exclude refunded buyers from upsell campaigns.",
    category: "Rules",
    icon: "Eraser",
    triggerType: "SALE_CANCELED",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "remove1",
    nodes: [
      tagNode("remove1", 0, "REMOVE_TAG"),
      tagNode("add1", 1, "ADD_TAG"),
      endNode("end", 2),
    ],
    edges: [
      edge("e1", "remove1", "add1"),
      edge("e2", "add1", "end"),
    ],
  },

  // ─── 15. Quick Rule: VIP threshold tagger ────────────────────────────────
  {
    id: "rule_vip_threshold",
    name: "Quick Rule — Tag VIP buyers",
    description: "Any order ≥ $500 → contact gets a `vip` tag. Combine with broadcast segments for VIP-only offers.",
    category: "Rules",
    icon: "Crown",
    triggerType: "NEW_SALE",
    triggerConfig: {},
    reEnrollPolicy: "ALWAYS",
    startNodeId: "cond1",
    nodes: [
      condAmount("cond1", 0, 50000),
      tagNode("tag_vip", 1, "ADD_TAG", -1),
      endNode("end_yes", 2, -1),
      endNode("end_no", 1, 1),
    ],
    edges: [
      edge("e1", "cond1", "tag_vip", "true"),
      edge("e2", "cond1", "end_no",  "false"),
      edge("e3", "tag_vip", "end_yes"),
    ],
  },
];

export function findTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
