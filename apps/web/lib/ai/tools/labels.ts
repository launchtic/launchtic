// User-facing labels for tool names shown in the chat progress UI.
// Keep terse + action-oriented ("Reading orders", "Creating funnel").
// Falls back to the raw tool name (with underscores → spaces) if unmapped,
// so a new tool always renders something coherent even before it's added here.
//
// IMPORTANT: when adding a new AI tool in lib/ai/tools/*.ts, add a label
// here too. Missing entries don't break — they just look unpolished.

const TOOL_LABELS: Record<string, string> = {
  // ─── Orders ──────────────────────────────────────────────────────────────
  list_recent_orders:         "Loading recent orders",
  get_revenue_summary:        "Calculating revenue",

  // ─── Contacts & tags ─────────────────────────────────────────────────────
  list_contacts:              "Loading contacts",
  create_contact:             "Creating contact",
  update_contact:             "Updating contact",
  list_tags:                  "Loading tags",
  create_tag:                 "Creating tag",
  tag_contact:                "Tagging contact",
  untag_contact:              "Removing tag",
  bulk_tag_contacts:          "Tagging contacts in bulk",

  // ─── Funnels ─────────────────────────────────────────────────────────────
  list_funnels:               "Listing funnels",
  get_funnel_details:         "Reading funnel",
  create_funnel_from_spec:    "Creating funnel",
  add_funnel_step:            "Adding step",
  delete_funnel_step:         "Removing step",
  delete_funnel:              "Deleting funnel",
  update_step_price_plan:     "Updating step pricing",
  add_order_bump:             "Adding order bump",
  update_order_bump_price:    "Updating bump price",
  grant_tag_on_purchase:      "Wiring tag grant",

  // ─── Page templates ──────────────────────────────────────────────────────
  list_page_templates:        "Looking up templates",
  swap_step_template:         "Swapping template",

  // ─── Broadcasts ──────────────────────────────────────────────────────────
  list_broadcasts:            "Listing broadcasts",
  get_broadcast_details:      "Reading broadcast",
  create_broadcast_from_spec: "Drafting broadcast",
  update_broadcast:           "Updating broadcast",
  cancel_broadcast:           "Canceling broadcast",

  // ─── Sequences ───────────────────────────────────────────────────────────
  list_sequences:             "Listing sequences",
  get_sequence_details:       "Reading sequence",
  create_sequence_from_spec:  "Drafting sequence",
  add_sequence_step:          "Adding sequence step",
  update_sequence_step:       "Updating sequence step",
  update_sequence_status:     "Toggling sequence status",

  // ─── Automations ─────────────────────────────────────────────────────────
  list_automations:           "Listing automations",
  update_automation_status:   "Toggling automation status",

  // ─── Coupons ─────────────────────────────────────────────────────────────
  list_coupons:               "Listing coupons",
  create_coupon:              "Creating coupon",
  attach_coupon_to_step:      "Attaching coupon to step",
  detach_coupon_from_step:    "Detaching coupon",

  // ─── Products (read-only) ────────────────────────────────────────────────
  list_products:              "Listing products",
  get_product_details:        "Reading product",

  // ─── Subscriptions (read-only) ───────────────────────────────────────────
  list_subscriptions:         "Listing subscriptions",
  get_subscription_details:   "Reading subscription",

  // ─── Transactions (read-only) ────────────────────────────────────────────
  list_transactions:          "Listing transactions",

  // ─── Email templates (read-only) ─────────────────────────────────────────
  list_email_templates:       "Listing email templates",
  get_email_template_details: "Reading email template",

  // ─── Email logs (read-only) ──────────────────────────────────────────────
  list_email_logs:            "Reading email logs",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}
