# Workflow rules

Canonical reference for the launchtic Workflow automation feature.
Captures every rule the runtime enforces and every guarantee the UI relies
on. Update this doc whenever the validation contract, trigger payload, or
re-fire semantics change.

Last reviewed: 2026-06.

---

## 1. Conceptual model

A **Workflow** is a directed graph of **Nodes** wired by **Edges**, plus
a **Trigger** that decides when a Contact enrolls.

- The trigger is a virtual node attached to the start of the graph (id
  `__trigger`). Never persisted to `Workflow.nodes` JSON.
- Each enrollment creates a **WorkflowRun** row tracking position
  (`currentNodeId`) and accumulated `context`.
- Each node execution writes a **WorkflowRunStep** for audit + retry.
- The worker (`apps/worker`) consumes BullMQ jobs; each job advances one
  node, then enqueues the next (with optional `delay`).

Source of truth for runtime is `apps/worker/src/queues/workflow.ts`. Source
of truth for validation is `apps/web/lib/workflow-validation.ts` (shared by
the builder and the activation endpoint).

---

## 2. Triggers

10 trigger types. All fire via `fireTrigger(workspaceId, type, context)` in
either `apps/web/lib/automations.ts` or `apps/renderer/lib/automations.ts`.
The two implementations are kept in sync — same signature, same gate logic.

### 2.1 Trigger catalog

| Trigger | Fires when | Context payload (must include) | Funnel-scoped? | Email-scoped? | Smart re-fire default |
|---|---|---|:---:|:---:|---|
| `NEW_SALE` | Order transitions to PAID | `contactId`, `orderId`, `funnelId`, `funnelStepId`, `orderTotal`, `orderCurrency` | ✅ | — | every |
| `SALE_CANCELED` | Order refunded or canceled | `contactId`, `orderId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `SUBSCRIPTION_PAYMENT_FAILED` | Stripe/PayPal recurring charge fails | `contactId`, `subscriptionId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `FORM_SUBMIT` | Contact submits a funnel-page form (incl. opt-in, checkout customer info) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | **once** |
| `CHECKOUT_STARTED` | Click Pay on checkout page (before charge) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `TAG_ADDED` | Tag attached to a contact (manual / API / workflow) | `contactId`, `tagId` | — | — | every |
| `TAG_REMOVED` | Tag detached from a contact | `contactId`, `tagId` | — | — | every |
| `EMAIL_OPENED` | First pixel hit on an EmailSend | `contactId`, `emailSendId`, `broadcastId?`, `workflowEmailId?` | — | ✅ | every |
| `EMAIL_LINK_CLICKED` | First click of any tracked link in an EmailSend | `contactId`, `emailSendId`, `broadcastId?`, `workflowEmailId?`, `linkUrl` | — | ✅ | every |
| `PAGE_VISITED` | Identified Contact loads a funnel page (via `lt_contact` cookie) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | every |

### 2.2 Trigger config rules (validation)

Server-side validator (`validateTrigger` in `workflow-validation.ts`) is
mirrored by the builder's red badges. Activation fails with the same
`issues[]` shape from the `/api/workflows/[id]/status` endpoint.

#### Funnel-scoped triggers
Must pick **both** `funnelId` and `funnelStepId`. There is no "any
funnel" or "any step" — operator scopes one workflow per funnel/step
combination. This rule covers `NEW_SALE`, `SALE_CANCELED`,
`SUBSCRIPTION_PAYMENT_FAILED`, `FORM_SUBMIT`, `CHECKOUT_STARTED`,
`PAGE_VISITED`.

Step types accepted per trigger (builder filters the Step dropdown
accordingly):

```
NEW_SALE                    → CHECKOUT, UPSELL, DOWNSELL
SALE_CANCELED               → CHECKOUT, UPSELL, DOWNSELL
SUBSCRIPTION_PAYMENT_FAILED → CHECKOUT, UPSELL, DOWNSELL
CHECKOUT_STARTED            → CHECKOUT
FORM_SUBMIT                 → OPTIN, SALES, CUSTOM, THANKYOU
PAGE_VISITED                → OPTIN, SALES, CHECKOUT, UPSELL, DOWNSELL, THANKYOU, CUSTOM
```

#### Tag-scoped triggers
`TAG_ADDED`, `TAG_REMOVED`: require `config.tagId`.

#### Email-scoped triggers
`EMAIL_OPENED`, `EMAIL_LINK_CLICKED`: require `config.source` discriminator
plus the matching id:

- `source: "broadcast"` → require `config.broadcastId`
- `source: "workflow_email"` → require `config.workflowEmailId`

`EMAIL_LINK_CLICKED` additionally accepts an optional `config.linkUrl`
(URL or path substring; matched with `String.includes` at runtime).

### 2.3 Trigger fire matcher

`matchesFilter(config, context, stepType)` returns true only when every
configured key matches the runtime context. Mismatch on any key →
workflow skipped. Both web and renderer share this logic verbatim:

```ts
if (config.funnelId        && context.funnelId        !== config.funnelId)        return false;
if (config.tagId           && context.tagId           !== config.tagId)           return false;
if (config.funnelStepId    && context.funnelStepId    !== config.funnelStepId)    return false;
if (config.stepType        && stepType                !== config.stepType)        return false;
if (config.broadcastId     && context.broadcastId     !== config.broadcastId)     return false;
if (config.workflowEmailId && context.workflowEmailId !== config.workflowEmailId) return false;
if (config.linkUrl && !String(context.linkUrl ?? "").includes(String(config.linkUrl))) return false;
return true;
```

---

## 3. Re-fire policy

Workflow-level setting controlled via the top-bar selector. Persists in
`Workflow.reFirePolicy`. Two values:

| Policy | Semantic | Use cases |
|---|---|---|
| `every` (default for transactional) | Each event spawns a new run. **Concurrent runs are allowed** — a contact who buys twice while a 24h-delay run is still pending gets enrolled twice. Matches Klaviyo / Mailchimp / Systeme.io. | NEW_SALE thank-you, EMAIL_OPENED engagement scoring, CHECKOUT_STARTED cart-recovery, PAGE_VISITED browse abandonment. |
| `once` (default for FORM_SUBMIT) | Fire ONCE per contact ever. Block enroll if ANY prior WorkflowRun exists for this (workflow, contact) regardless of status. | Welcome series, lead-magnet delivery, onboarding sequences. |

### 3.1 Smart defaults

When the operator changes trigger type, the selector snaps to the smart
default for the new trigger:

```ts
TRIGGER_DEFAULT_REFIRE_POLICY = {
  NEW_SALE:                    "every",
  SALE_CANCELED:               "every",
  SUBSCRIPTION_PAYMENT_FAILED: "every",
  CHECKOUT_STARTED:            "every",
  EMAIL_OPENED:                "every",
  EMAIL_LINK_CLICKED:          "every",
  TAG_ADDED:                   "every",
  TAG_REMOVED:                 "every",
  PAGE_VISITED:                "every",   // throttled separately via 1h Redis cooldown
  FORM_SUBMIT:                 "once",    // welcome / lead-magnet pattern
}
```

Operator can override after the snap; the override persists across saves.

### 3.2 Re-fire gate (in fireTrigger)

```ts
if (context.contactId && wf.reFirePolicy === "once") {
  const existing = await db.workflowRun.findFirst({
    where: { workflowId: wf.id, contactId: context.contactId },
    select: { id: true },
  });
  if (existing) continue;
}
```

`every` skips the check entirely — concurrent runs created freely.

---

## 4. Source-level dedupe (per trigger)

Each trigger source layer has its own dedupe mechanism. Re-fire policy
operates on top of this; dedupe runs FIRST.

| Trigger | Mechanism | Where | Window |
|---|---|---|---|
| `PAGE_VISITED` | Redis `SET NX EX` lock | `apps/renderer/app/[[...slug]]/page.tsx` + `/api/track/visit` | 1 hour |
| `FORM_SUBMIT` | `ContactEvent` table row | `apps/renderer/app/api/submit/route.ts` | 60 seconds |
| `EMAIL_OPENED` | First-open flag (`EmailSend.openedAt IS NULL`) | `/api/email/track/open/[emailSendId]` | first-only |
| `EMAIL_LINK_CLICKED` | First-click flag (`EmailSend.clickedAt IS NULL`) | `/api/email/track/click/[token]` | first-only |
| `NEW_SALE` | None (each PAID transition is real) | Stripe / PayPal webhook | — |
| `SALE_CANCELED` | None | Webhook | — |
| `CHECKOUT_STARTED` | None | `/api/checkout/intent` | — |
| `SUBSCRIPTION_PAYMENT_FAILED` | None (idempotent webhook events) | Webhook | — |
| `TAG_ADDED` / `TAG_REMOVED` | None (operator-explicit) | Tag mutation routes | — |

### 4.1 PAGE_VISITED reload spam protection

Page reloads are frequent (tab switching, navigation back/forth). The 1h
Redis cooldown key `pv:{contactId}:{funnelStepId}` blocks reload-triggered
fires until 1 hour after the previous fire. Without this, a `PAGE_VISITED →
SEND_EMAIL → END` workflow would email the contact on every reload.

Performance note: Redis `SET NX EX` is ~1ms and ~100 bytes/key. With 1h TTL
and identified-only firing (cookie required), memory pressure is
negligible (~50MB at 500k unique combos peak hour).

---

## 5. Identity model

### 5.1 `lt_contact` cookie

Workflows can only enroll a **known** contact (one with a `contactId`).
Identity is established at one of four capture points and persisted in a
HttpOnly `lt_contact` cookie (30-day TTL, SameSite=Lax, Secure in prod):

| Capture point | Endpoint |
|---|---|
| Email link click | `apps/renderer/app/api/email/track/click/[token]/route.ts` |
| Funnel form opt-in | `apps/renderer/app/api/submit/route.ts` (optin branch) |
| Checkout intent | `apps/renderer/app/api/checkout/intent/route.ts` |
| Checkout confirm | `apps/renderer/app/api/checkout/confirm/route.ts` (defensive re-set for PayPal) |

Helper: `setLtContactCookie(response, contactId)` in
`apps/renderer/lib/identity-cookie.ts`.

### 5.2 Cookie scoping rules (browser-enforced)

Cookie has NO `Domain` attribute → scoped to **exact origin**. This means:

- Multi-customer SaaS on separate domains → independent cookies ✅
- Multi-workspace on separate subdomains → independent cookies ✅
- Multi-funnel same domain → cookie shared (same workspace assumed) ✅
- Cross-domain identity transfer → email-click bridge only (no other method)

### 5.3 Cross-workspace defense

Even with cookie collision (shared root domain, rare), the `firePageVisited`
helper verifies `Contact.workspaceId === Funnel.workspaceId` before
firing the trigger. Stolen / stale cookies pointing at a contact from a
different workspace → silent skip, no fire.

### 5.4 Anonymous visitors

No `lt_contact` cookie → no trigger fire. The page renders normally; only
PAGE_VISITED and downstream identity-required triggers skip. Anonymous
events are not tracked individually (no AnonymousSession table — defer to
Phase 2 if needed).

---

## 6. Node types (Actions)

All node types validated by `validateNode(type, config)`.

| Type | Required config | Behavior |
|---|---|---|
| `SEND_EMAIL` | `emailId` (FK to `WorkflowEmail` row) | Worker renders linked email body with Mustache vars, creates `EmailSend` row (sets `workflowEmailId` FK), enqueues SMTP delivery. Bumps `WorkflowEmail.sentCount` |
| `ADD_TAG` | `tagId` | Idempotent upsert into `ContactTag` |
| `REMOVE_TAG` | `tagId` | Delete row from `ContactTag` if present (no-op if absent) |
| `WEBHOOK` | `url` (http/https), `method` (GET/POST/PUT/PATCH) | POST JSON envelope with type discriminator + custom headers. Non-2xx → step FAILED |
| `DELAY` | At least one of `days` / `hours` / `minutes` non-zero; total ≤ 365 days | Worker schedules next step at `scheduledFor = now + totalMs`. Run stays ACTIVE while waiting |
| `CONDITION` | `kind` discriminator + kind-specific fields (see §7) | Sets `preferredLabel` to `"true"` or `"false"` — worker picks the matching outgoing edge |
| `END` | Optional `reason` (free text, ≤ ~50 chars) | Marks `WorkflowRun.status = COMPLETED`, `exitReason = reason` |

### 6.1 WorkflowEmail entity

`SEND_EMAIL` nodes don't store content inline — they reference a separate
`WorkflowEmail` row by `config.emailId`. This lets multiple SEND_EMAIL
nodes share the same email body and gives the email its own analytics
(`sentCount`, `openedCount`, `clickedCount` denormalized counters).

Lifecycle:
- Add SEND_EMAIL node → emailId is `null`. Operator picks an existing
  email or clicks "Create new email" (navigates to `/emails/new`).
- "Create new email" page does NOT write to DB until Save — abandoning
  the page leaves no orphan row.
- Delete SEND_EMAIL node → linked `WorkflowEmail` is NOT deleted. It may
  be reused by another node or kept as a draft. Orphan cleanup is via the
  `/workflows/[id]/emails` listing page.
- Type-switch from SEND_EMAIL → ADD_TAG → linked email also NOT deleted.

The email editor (`/workflows/[id]/emails/[emailId]/edit`) is fullscreen,
uses the maily.to TipTap editor, and has explicit Save (no autosave).
Validation: subject non-empty, sender picked (senderId OR fromName +
fromEmail), bodyHtml is a non-empty maily JSON doc (walked for text /
image / button / logo nodes via `isMailyDocEmpty`).

### 6.2 SEND_EMAIL content format

`WorkflowEmail.bodyHtml` is a **JSON-stringified maily.to TipTap doc**, NOT
raw HTML. The worker's `renderEmailContent` (in `packages/email/src/render.ts`)
rejects anything that doesn't start with `{`. Templates use a maily DSL
(`doc`, `p`, `btn`, `link`, `bold`, …) in `apps/web/lib/workflow-templates.ts`
to author bodies — these emit valid TipTap JSON.

---

## 7. CONDITION kinds

`CONDITION` nodes branch on `preferredLabel` set by the executor.
Edges must be labeled `"true"` and `"false"`; graph validation enforces
both branches exist.

| Kind | Required config | True when |
|---|---|---|
| `contact_tag` | `tagId`, `operator` ∈ {`has`, `does_not_have`} | Contact has (or lacks) the tag |
| `contact_field` | `field`, `operator` ∈ {`equals`, `begins`, `contains`, `ends`}, `value` | String compare (case-insensitive) on `Contact.{field}` |
| `contact_purchased` | (optional `funnelStepId`) | Any `Order` with `status = PAID` for this contact since `run.startedAt`; if `funnelStepId` set, scopes to that step |
| `email_opened` | `source` ∈ {`broadcast`, `workflow_email`} + matching id | `EmailSend.openedAt ≥ run.startedAt` for the configured source. **No `"any"` option** — was dropped because it routed on unrelated engagement |
| `email_clicked` | Same as `email_opened` | Same shape, checks `clickedAt` instead |

Conditions fail closed: missing config / unsupported kind → `result = false`.

---

## 8. Graph rules

`validateGraph(nodes, edges, startNodeId)` enforces:

1. `startNodeId` must be set and present in `nodes`.
2. Every `edge.source` and `edge.target` must reference an existing node.
3. `CONDITION` nodes must have BOTH a `true` and `false` outgoing edge.
4. Non-`END` nodes must have at least one outgoing edge (no dead ends).

Edge labels:
- `CONDITION` outputs: `"true"` / `"false"` (drives the executor's edge
  pick via `ctx.preferredLabel`)
- All other linear nodes: no label

---

## 9. Activation gating (Klaviyo-strict lock)

When `Workflow.status = ACTIVE`:

### 9.1 Server-side guards
- `PATCH /api/workflows/[id]` returns **409** "Workflow is active — pause it to edit."
- `POST /api/workflows/[id]/emails` returns **409**
- `PATCH /api/workflows/[id]/emails/[emailId]` returns **409**
- `DELETE /api/workflows/[id]/emails/[emailId]` returns **409**
- Status transitions (`/api/workflows/[id]/status`) ARE allowed (operator
  must be able to Pause).

### 9.2 UI guards
- Top bar shows yellow lock banner "Workflow is active — edits are locked.
  Click Pause to make changes."
- Workflow name input: readonly
- Re-fire selector: disabled
- Save button: hidden
- "+" picker on nodes: hidden
- Delete X on nodes: hidden
- Keyboard Delete/Backspace: blocked via `onNodesChangeGuarded`
- Node click → modal opens but all form controls disabled (via wrapping
  `<fieldset disabled>`)
- Type switcher in modal: disabled
- "Create new email" link: hidden
- Email editor + listing: readonly with same banner

### 9.3 Activate flow
1. Operator clicks Activate (status=DRAFT or PAUSED).
2. Client runs `validateWorkflow()` — if issues exist, opens the pre-flight
   modal listing them, does NOT call the server.
3. Otherwise → pre-save (via the same PATCH endpoint, which works because
   status is still pre-ACTIVE) → call `PATCH /api/workflows/[id]/status`
   with `{status: "ACTIVE"}` → server re-validates → 400 with issues[] or
   commit.
4. Existing runs continue executing the graph snapshot they enrolled with.
5. New triggers enroll under the new config.

---

## 10. Runtime execution semantics

### 10.1 Job lifecycle
- Trigger fires → `WorkflowRun` row created (status=ACTIVE) → BullMQ
  `workflow.step` job enqueued for `startNodeId`.
- Worker (`processWorkflowJob`) loads the run + workflow + contact, finds
  the node by id, executes it.
- Lifecycle gates skip the job if:
  - Run is not ACTIVE (paused / completed / failed)
  - Workflow is not ACTIVE (operator paused / archived mid-flight → run
    exits with `EXITED` + reason `workflow_<status>`)
  - `run.currentNodeId` ≠ job's `nodeId` (graph edited under us → skip
    silently; the latest enqueued job will execute the right node)
- Step is recorded as a `WorkflowRunStep` row (RUNNING → COMPLETED /
  FAILED / SKIPPED) for audit.
- Next step is enqueued with optional `delay` from `ctx.contextDelta.__delayMs`.

### 10.2 Failure handling
- Per-node failure: log error → mark step FAILED → run keeps going (does
  NOT abort the run). Allows transient WEBHOOK / SMTP errors to be
  retried by BullMQ or skipped without ending the run.
- Worker-side unrecoverable error: BullMQ retries up to 2 attempts with
  exponential backoff (30s base). If both fail, the job lands in the
  `failed` set.

### 10.3 Concurrency
- BullMQ worker concurrency configurable via `WORKFLOW_WORKER_CONCURRENCY`
  (default 8).
- Re-fire `every` allows the same contact to have multiple concurrent
  WorkflowRuns. Each has its own `currentNodeId`, `context`, and step
  chain. No mutex needed — runs are independent state machines.

---

## 11. Templates

`apps/web/lib/workflow-templates.ts` ships 17 pre-built templates.
Clone-and-customize via the gallery (`TemplateGallery.tsx`).

Categories:
- **Sales**: Cart Abandonment Recovery (3-step, Flagship), Browse Abandonment (PAGE_VISITED)
- **Onboarding**: Welcome Series (3 emails, Popular), Post-purchase Thank You (Popular), Lead Magnet Delivery (New)
- **Retention**: Refund Follow-up, Failed Payment Grace, FAQ Visit → Customer Support Outreach (New)
- **Re-engagement**: Re-engagement Sequence
- **Tagging**: Segment-Specific Onboarding, Engaged Reader Tagger, High-Intent Page Tagger (New)
- **Rules**: Auto-tag form leads, Trial → Paid tag swap, Refund cleanup

### 11.1 Template structure

```ts
{
  id, name, description, category, icon, badge?,
  triggerType, triggerConfig: {},  // operator fills funnel/step on clone
  reFirePolicy?: "every" | "once",  // omit → uses smart default per trigger
  startNodeId,
  nodes: TemplateNode[],
  edges: TemplateEdge[],
}
```

### 11.2 Email content

Template SEND_EMAIL nodes carry seed content in `config.subject` +
`config.bodyHtml`. The clone route (`/api/workflows/from-template`):
1. Creates the Workflow row with `reFirePolicy` from the template OR the
   smart default for `triggerType`.
2. For each SEND_EMAIL node with non-empty subject/body, creates a
   `WorkflowEmail` row with that content + the workspace's default sender.
3. Rewrites the node's `config` to `{emailId: <newEmailId>}`, stripping
   the inline content.

Template bodies use a maily.to DSL (`doc(p("..."), btn("CTA", "/url"), …)`)
to emit valid TipTap JSON. Plain HTML in templates would throw at send
time — the renderer rejects anything that doesn't start with `{`.

---

## 12. API surface

| Endpoint | Method | Purpose | Locked? |
|---|---|---|---|
| `/api/workflows` | GET | List workspace workflows | — |
| `/api/workflows` | POST | Create workflow (DRAFT) | — |
| `/api/workflows/[id]` | GET | Read | — |
| `/api/workflows/[id]` | PATCH | Update name / trigger / nodes / edges / reFirePolicy | 🔒 409 if ACTIVE |
| `/api/workflows/[id]` | DELETE | Remove + cascade WorkflowRun | — |
| `/api/workflows/[id]/status` | PATCH | Status transition (DRAFT/PAUSED/ACTIVE/ARCHIVED). DRAFT/PAUSED → ACTIVE re-runs validation | — |
| `/api/workflows/[id]/emails` | GET | List workflow's emails | — |
| `/api/workflows/[id]/emails` | POST | Create blank email | 🔒 409 if parent ACTIVE |
| `/api/workflows/[id]/emails/[emailId]` | PATCH | Update email content | 🔒 409 if parent ACTIVE |
| `/api/workflows/[id]/emails/[emailId]` | DELETE | Remove email (EmailSend.workflowEmailId set NULL) | 🔒 409 if parent ACTIVE |
| `/api/workflows/[id]/email-links` | GET | Extract distinct hrefs from broadcast/workflow_email bodyHtml | — |
| `/api/workflows/from-template` | POST | Clone template → DRAFT workflow + WorkflowEmail rows | — |
| `/api/track/visit` | POST | Client-side PAGE_VISITED ping (alternative to server-side render fire) | — |

All endpoints are workspace-scoped via `requireWorkspaceFromSlug` /
`requireAccess`; the `X-Workspace-Slug` header is required.

---

## 13. Validation message catalog

Operator-facing strings produced by the validator. Stable surface — any
test asserting these strings has a hard dependency on the wording.

- Trigger: `"Pick a trigger type."`
- TAG_ADDED / TAG_REMOVED: `"Pick which tag this trigger watches for."`
- Funnel-scoped triggers: `"Pick which funnel this trigger watches."` /
  `"Pick which step in that funnel triggers the workflow."`
- Email-scoped triggers: `"Pick an email source (broadcast or workflow
  email)."` / `"Pick which broadcast this trigger watches for."` / `"Pick
  which workflow email this trigger watches for."`
- EMAIL_LINK_CLICKED + linkUrl invalid: `"Link filter must be a URL or URL
  substring (e.g. https://… or /path)."`
- Deprecated node type: `"Node type "{TYPE}" is no longer supported.
  Delete this node and replace with a supported step."`
- SEND_EMAIL no emailId: `"Pick or create an email for this step."`
- WorkflowEmail content checks: `"Email sender is not picked."` / `"Email
  subject is empty."` / `"Email body is empty."`
- Linked email missing: `"Linked email no longer exists. Pick or create a
  new one."`
- WEBHOOK invalid URL: `"URL is empty."` / `"URL must start with http://
  or https://."` / `"Method must be GET, POST, PUT, or PATCH."`
- DELAY: `"Delay values cannot be negative."` / `"Set at least 1 minute,
  hour, or day."` / `"Total delay can't exceed 365 days."`
- CONDITION: `"Condition kind not picked."` / kind-specific messages
- CONDITION email source: `"Pick an email source (broadcast or workflow
  email)."`
- Graph: `"Connect the trigger to a starting step."` / `"Start node is
  missing from the graph."` / `"Edge {id} points to a missing node."` /
  `"If/else needs both a true and a false branch."` / `"Step "{LABEL}"
  has no next step. Add one or connect it to End."`

---

## 14. Mustache variables (SEND_EMAIL render)

Available in `subject` and `bodyHtml` (after maily render). Resolved at
send time by the worker from `RunCtx`:

- `contact.firstName`, `contact.lastName`, `contact.email`
- `workspace.name`
- `order.*` (when trigger payload included order data — NEW_SALE, SALE_CANCELED)
- `unsubscribeUrl` (auto-injected before send)
- Any `triggerData.*` / `context.*` key from the run

Variables panel in the editor (bottom of fullscreen email editor) lists
the canonical set from `STANDARD_VARIABLES` (in `@launchtic/email`).

---

## 15. Common patterns

### 15.1 Post-purchase Thank You + Onboarding (split)
- Workflow A: `NEW_SALE → SEND_EMAIL "Thanks" → END` with `reFirePolicy: "every"`
  → fires per order, concurrent runs.
- Workflow B: `NEW_SALE → DELAY 24h → SEND_EMAIL "Getting started" → END`
  with `reFirePolicy: "once"` → fires only for the contact's first order.

### 15.2 Cart abandonment recovery (with auto-exit)
```
CHECKOUT_STARTED → DELAY 1h → CONDITION contact_purchased
                                ├─ true  → END "purchased"
                                └─ false → SEND "Forgot something?"
                                          → DELAY 23h
                                          → CONDITION contact_purchased
                                            ├─ true  → END
                                            └─ false → SEND "Last chance"
                                                      → END
```
`reFirePolicy: "every"` so each new checkout attempt enrolls.

### 15.3 Cross-workflow chain (workflow A's email → triggers workflow B)
- Workflow A sends email E1.
- Workflow B trigger = `EMAIL_OPENED` with `source: "workflow_email"`,
  `workflowEmailId: E1.id`.
- Contact opens E1 → tracking pixel fires `EMAIL_OPENED` with
  `workflowEmailId = E1.id` → workflow B enrolls.

### 15.4 Cold visitor → tag-bridge for retargeting
- Workflow A: `FORM_SUBMIT → ADD_TAG "interested:productX" → END`
  (default `reFirePolicy: "once"` prevents re-tagging).
- Workflow B: `TAG_ADDED tagId=interested:productX → SEND "Welcome" → DELAY 3d → … → END`
- Workflow C: `TAG_ADDED tagId=interested:productX → WEBHOOK Facebook Ads Custom Audience`

### 15.5 One-time fire for everything-else trigger (operator wants "once")
Default for non-FORM_SUBMIT triggers is `every`. Operator switches the
top-bar selector to `once` to gate any workflow to once-per-contact.

### 15.6 Gate workflow with CONDITION + tag (alternate to "once")
```
TRIGGER (any) → CONDITION contact_tag "X_done"
                  ├─ true  → END
                  └─ false → ADD_TAG "X_done" → … → END
```
Works regardless of `reFirePolicy` setting — useful when you want some
side effects each fire (e.g. analytics tag) and others once.

---

## 16. Testing

Smoke tests live in `apps/web/scripts/`:

| File | Coverage |
|---|---|
| `test-source-picker.mts` | Pure-logic validation rules (36 tests) |
| `test-source-picker-integration.mts` | DB integration — fireTrigger pipeline + execCondition queries (14 tests) |
| `test-workflow-coverage.mts` | DB integration — other conditions, other triggers, graph rules, DELAY math, SEND_EMAIL DB write (37 tests) |
| `test-refire-policy.mts` | DB integration — every (concurrent) + once (block-all) semantics (8 tests) |
| `test-template-bodies.mts` | Validate every template SEND_EMAIL body is valid maily JSON (120 checks across 24 emails) |
| `test-template-render.mts` | Exercise `@maily-to/render` on every template email (24 emails) |

Run individually:
```bash
pnpm --filter @launchtic/worker exec tsx <abs-path-to-script>
```

All test data uses `smoketest_*` namespace and cleans up in `finally`.

---

## 17. Schema reference

Key columns on `Workflow` model:

```prisma
model Workflow {
  id            String         @id @default(cuid())
  workspaceId   String
  name          String
  description   String?
  status        WorkflowStatus @default(DRAFT)
  triggerType   String
  triggerConfig Json?
  nodes         Json
  edges         Json
  startNodeId   String?
  reFirePolicy  String         @default("every")  // "every" | "once"
  maxDurationDays Int?
  // Denormalized counters
  totalEnrolled  Int @default(0)
  activeCount    Int @default(0)
  completedCount Int @default(0)
  exitedCount    Int @default(0)
  // …timestamps, relations
}
```

`WorkflowRun`:
- `status`: ACTIVE | COMPLETED | EXITED | FAILED
- `exitReason`: free text — `"purchased"` / `"goal"` / `"manual"` /
  `"workflow_paused"` / `"workflow_archived"` / END node's `config.reason`
  / `"end_node"` (default for unlabeled END)

---

## 18. Out of scope / Phase 2

Tracked but deliberately deferred:

- **Anonymous visitor identification + stitching** — cold-traffic
  PAGE_VISITED for visitors who never engaged via email/form. Requires
  AnonymousSession + AnonymousEvent tables. See research notes — Systeme
  and most competitors don't track anonymous individuals either; safe to
  defer.
- **Email-blur capture for CHECKOUT_STARTED** — fire on email field blur
  instead of click Pay. Doubles abandonment-recovery surface but
  requires bot/disposable protection layer (regex + MX lookup + Redis
  rate limit + disposable-email-domains list).
- **Per-workflow cooldown N days** — formerly the `COOLDOWN` re-enroll
  policy. Removed for simplicity; achievable via DELAY node + CONDITION
  contact_tag gate.
- **External webhook → workflow trigger** — fire a workflow from a
  third-party event.
- **Workflow-level analytics dashboard** — currently denormalized counters
  + run history. No funnel/conversion view per workflow yet.
- **Configurable PAGE_VISITED dedupe TTL** — currently hardcoded 1h.
- **Phone-first / external-userId identity** — current model is email-only
  for Contact uniqueness.
