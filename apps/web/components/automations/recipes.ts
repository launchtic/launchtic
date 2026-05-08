// Pre-built automation recipes.
// Used by RecipeDialog as starting points so users don't face an empty builder.

import type { LucideIcon } from "lucide-react";
import { Gift, Tag, Gem, HandHeart, Rocket, Bell } from "lucide-react";

export type RecipeAction = {
  actionType: "SEND_EMAIL" | "ADD_TAG" | "REMOVE_TAG" | "WEBHOOK" | "START_SEQUENCE";
  actionConfig: Record<string, unknown>;
  emailSubject?: string;
  emailHtmlBody?: string;
};

export type Recipe = {
  id: string;
  icon: LucideIcon;
  iconColor: string;  // Tailwind classes for the icon badge background + foreground
  name: string;
  description: string;
  badge?: string;
  template: {
    name: string;
    triggerType: "NEW_SALE" | "SALE_CANCELED" | "SUBSCRIPTION_PAYMENT_FAILED" | "FORM_SUBMIT" | "TAG_ADDED" | "TAG_REMOVED" | "EMAIL_LINK_CLICKED";
    triggerConfig: Record<string, unknown>;
    actions: RecipeAction[];
  };
};

const PURCHASE_THANK_YOU_HTML = `<p>Hi {{contact.firstName}},</p>
<p>Thank you for your purchase. We've received your order and will process it as soon as possible.</p>
<p>If you have any questions, reply to this email and we'll be happy to help.</p>
<p>Best regards,<br>{{workspace.name}}</p>`;

const OPTIN_WELCOME_HTML = `<p>Hi {{contact.firstName}},</p>
<p>Thanks for signing up! We'll keep you posted with the most useful updates.</p>
<p>Best regards,<br>{{workspace.name}}</p>`;

const VIP_WELCOME_HTML = `<p>Hi {{contact.firstName}},</p>
<p>Congratulations — you're now a VIP customer! Here's a thank-you gift just for you:</p>
<p><strong>Coupon code: VIP10</strong> — 10% off your next order.</p>
<p>Best regards,<br>{{workspace.name}}</p>`;

const ABANDON_HTML = `<p>Hi {{contact.firstName}},</p>
<p>You left something behind. Pick up where you left off:</p>
<p><a href="#">Complete your order →</a></p>`;

export const RECIPES: Recipe[] = [
  {
    id: "welcome_purchase",
    icon: Gift,
    iconColor: "bg-emerald-50 text-emerald-600",
    name: "Welcome new customer",
    description: "Send a thank-you email when someone makes a purchase.",
    badge: "Most popular",
    template: {
      name: "Welcome new customer",
      triggerType: "NEW_SALE",
      triggerConfig: {},
      actions: [
        {
          actionType: "SEND_EMAIL",
          actionConfig: {},
          emailSubject: "Thank you for your purchase!",
          emailHtmlBody: PURCHASE_THANK_YOU_HTML,
        },
      ],
    },
  },
  {
    id: "tag_buyer_as_customer",
    icon: Tag,
    iconColor: "bg-blue-50 text-blue-600",
    name: "Tag buyers as 'customer'",
    description: "Auto-tag every buyer for segmentation.",
    template: {
      name: "Tag buyers as customer",
      triggerType: "NEW_SALE",
      triggerConfig: {},
      actions: [
        { actionType: "ADD_TAG", actionConfig: { tagId: "" } },
      ],
    },
  },
  {
    id: "vip_threshold",
    icon: Gem,
    iconColor: "bg-purple-50 text-purple-600",
    name: "VIP for high-value buyers",
    description: "Tag and reward customers who spend over $100.",
    template: {
      name: "VIP for high-value buyers",
      triggerType: "NEW_SALE",
      triggerConfig: {},
      actions: [
        { actionType: "ADD_TAG", actionConfig: { tagId: "" } },
        {
          actionType: "SEND_EMAIL",
          actionConfig: {},
          emailSubject: "A thank-you for our VIP customers",
          emailHtmlBody: VIP_WELCOME_HTML,
        },
      ],
    },
  },
  {
    id: "optin_welcome",
    icon: HandHeart,
    iconColor: "bg-amber-50 text-amber-600",
    name: "Welcome new subscribers",
    description: "Send a welcome email when someone fills out an opt-in form.",
    template: {
      name: "Welcome new subscribers",
      triggerType: "FORM_SUBMIT",
      triggerConfig: {},
      actions: [
        {
          actionType: "SEND_EMAIL",
          actionConfig: {},
          emailSubject: "Welcome to {{workspace.name}}!",
          emailHtmlBody: OPTIN_WELCOME_HTML,
        },
      ],
    },
  },
  {
    id: "tag_added_followup",
    icon: Rocket,
    iconColor: "bg-pink-50 text-pink-600",
    name: "Tag-triggered follow-up",
    description: "Send an email when a specific tag is added (e.g. lead → nurture).",
    template: {
      name: "Tag-triggered follow-up",
      triggerType: "TAG_ADDED",
      triggerConfig: { tagId: "" },
      actions: [
        {
          actionType: "SEND_EMAIL",
          actionConfig: {},
          emailSubject: "Start your journey",
          emailHtmlBody: ABANDON_HTML,
        },
      ],
    },
  },
  {
    id: "slack_notify",
    icon: Bell,
    iconColor: "bg-orange-50 text-orange-600",
    name: "Notify Slack on purchase",
    description: "POST a webhook to Slack/Discord when a sale happens.",
    template: {
      name: "Notify Slack on purchase",
      triggerType: "NEW_SALE",
      triggerConfig: {},
      actions: [
        { actionType: "WEBHOOK", actionConfig: { url: "", method: "POST" } },
      ],
    },
  },
];

export const BLANK_TEMPLATE: Recipe["template"] = {
  name: "Untitled automation",
  triggerType: "NEW_SALE",
  triggerConfig: {},
  actions: [],
};
