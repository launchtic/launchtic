# Quy tắc Workflow

Tài liệu tham chiếu chuẩn cho tính năng tự động hoá Workflow của launchtic.
Mô tả mọi quy tắc mà runtime ép buộc và mọi đảm bảo mà UI dựa vào. Cập nhật
tài liệu này bất cứ khi nào contract validation, payload của trigger hoặc
ngữ nghĩa re-fire thay đổi.

Lần rà soát gần nhất: 2026-06.

---

## 1. Mô hình khái niệm

Một **Workflow** là một đồ thị có hướng gồm các **Node** được nối với nhau
bằng các **Edge**, cộng với một **Trigger** quyết định khi nào một Contact
được enroll.

- Trigger là một node ảo gắn vào điểm bắt đầu của đồ thị (id
  `__trigger`). Không bao giờ được lưu vào JSON `Workflow.nodes`.
- Mỗi lần enroll tạo ra một bản ghi **WorkflowRun** để theo dõi vị trí
  (`currentNodeId`) và `context` tích luỹ.
- Mỗi lần thực thi node ghi một **WorkflowRunStep** để audit + retry.
- Worker (`apps/worker`) tiêu thụ các job BullMQ; mỗi job chạy tiến một
  node, sau đó enqueue node tiếp theo (kèm `delay` tuỳ chọn).

Nguồn chân lý cho runtime là `apps/worker/src/queues/workflow.ts`. Nguồn
chân lý cho validation là `apps/web/lib/workflow-validation.ts` (dùng chung
giữa builder và endpoint activation).

---

## 2. Triggers

Có 10 loại trigger. Tất cả đều kích hoạt qua
`fireTrigger(workspaceId, type, context)` trong `apps/web/lib/automations.ts`
hoặc `apps/renderer/lib/automations.ts`. Hai bản triển khai được giữ đồng
bộ — cùng signature, cùng logic gating.

### 2.1 Danh mục trigger

| Trigger | Kích hoạt khi | Payload context (bắt buộc có) | Theo funnel? | Theo email? | Re-fire mặc định thông minh |
|---|---|---|:---:|:---:|---|
| `NEW_SALE` | Order chuyển sang PAID | `contactId`, `orderId`, `funnelId`, `funnelStepId`, `orderTotal`, `orderCurrency` | ✅ | — | every |
| `SALE_CANCELED` | Order bị hoàn tiền hoặc huỷ | `contactId`, `orderId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `SUBSCRIPTION_PAYMENT_FAILED` | Lần thanh toán định kỳ Stripe/PayPal thất bại | `contactId`, `subscriptionId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `FORM_SUBMIT` | Contact submit form trên trang funnel (gồm opt-in, thông tin khách hàng ở checkout) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | **once** |
| `CHECKOUT_STARTED` | Bấm Pay trên trang checkout (trước khi charge) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | every |
| `TAG_ADDED` | Tag được gắn vào contact (thủ công / API / workflow) | `contactId`, `tagId` | — | — | every |
| `TAG_REMOVED` | Tag bị gỡ khỏi contact | `contactId`, `tagId` | — | — | every |
| `EMAIL_OPENED` | Lần đầu pixel được load trên một EmailSend | `contactId`, `emailSendId`, `broadcastId?`, `workflowEmailId?` | — | ✅ | every |
| `EMAIL_LINK_CLICKED` | Lần đầu click vào bất kỳ link tracked nào trong EmailSend | `contactId`, `emailSendId`, `broadcastId?`, `workflowEmailId?`, `linkUrl` | — | ✅ | every |
| `PAGE_VISITED` | Contact đã định danh load một trang funnel (qua cookie `lt_contact`) | `contactId`, `funnelId`, `funnelStepId` | ✅ | — | every |

### 2.2 Quy tắc cấu hình trigger (validation)

Bộ validate server-side (`validateTrigger` trong `workflow-validation.ts`)
được phản chiếu bởi các badge đỏ trên builder. Activation thất bại với cùng
hình thức `issues[]` từ endpoint `/api/workflows/[id]/status`.

#### Triggers theo funnel
Phải chọn **cả** `funnelId` lẫn `funnelStepId`. Không có lựa chọn "any
funnel" hay "any step" — operator gán một workflow cho từng cặp funnel/step.
Quy tắc này áp dụng cho `NEW_SALE`, `SALE_CANCELED`,
`SUBSCRIPTION_PAYMENT_FAILED`, `FORM_SUBMIT`, `CHECKOUT_STARTED`,
`PAGE_VISITED`.

Loại step được chấp nhận cho từng trigger (builder lọc dropdown Step theo
đó):

```
NEW_SALE                    → CHECKOUT, UPSELL, DOWNSELL
SALE_CANCELED               → CHECKOUT, UPSELL, DOWNSELL
SUBSCRIPTION_PAYMENT_FAILED → CHECKOUT, UPSELL, DOWNSELL
CHECKOUT_STARTED            → CHECKOUT
FORM_SUBMIT                 → OPTIN, SALES, CUSTOM, THANKYOU
PAGE_VISITED                → OPTIN, SALES, CHECKOUT, UPSELL, DOWNSELL, THANKYOU, CUSTOM
```

#### Triggers theo tag
`TAG_ADDED`, `TAG_REMOVED`: yêu cầu `config.tagId`.

#### Triggers theo email
`EMAIL_OPENED`, `EMAIL_LINK_CLICKED`: yêu cầu trường discriminator
`config.source` cộng với id tương ứng:

- `source: "broadcast"` → yêu cầu `config.broadcastId`
- `source: "workflow_email"` → yêu cầu `config.workflowEmailId`

`EMAIL_LINK_CLICKED` còn chấp nhận thêm `config.linkUrl` tuỳ chọn (URL hoặc
chuỗi con của path; được so khớp bằng `String.includes` tại runtime).

### 2.3 Bộ so khớp khi trigger fire

`matchesFilter(config, context, stepType)` chỉ trả về true khi mọi key đã
cấu hình đều khớp với context runtime. Lệch ở bất kỳ key nào → workflow
bị bỏ qua. Cả web và renderer dùng chung logic này nguyên văn:

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

## 3. Chính sách Re-fire

Cấu hình ở cấp workflow, điều khiển qua selector trên top-bar. Lưu trong
`Workflow.reFirePolicy`. Có hai giá trị:

| Policy | Ngữ nghĩa | Trường hợp dùng |
|---|---|---|
| `every` (mặc định cho các trigger giao dịch) | Mỗi sự kiện sinh ra một run mới. **Cho phép run đồng thời** — một contact mua hai lần khi run delay 24h vẫn đang chờ sẽ được enroll hai lần. Giống Klaviyo / Mailchimp / Systeme.io. | Thank-you NEW_SALE, scoring engagement EMAIL_OPENED, recovery giỏ hàng CHECKOUT_STARTED, browse abandonment PAGE_VISITED. |
| `once` (mặc định cho FORM_SUBMIT) | Chỉ fire MỘT lần cho mỗi contact, mãi mãi. Chặn enroll nếu đã tồn tại BẤT KỲ WorkflowRun nào trước đó cho cặp (workflow, contact) bất kể trạng thái. | Welcome series, gửi lead-magnet, các chuỗi onboarding. |

### 3.1 Mặc định thông minh

Khi operator đổi loại trigger, selector tự "snap" về mặc định thông minh
của trigger mới:

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
  PAGE_VISITED:                "every",   // được throttle riêng qua cooldown Redis 1h
  FORM_SUBMIT:                 "once",    // mẫu welcome / lead-magnet
}
```

Operator có thể override sau khi snap; giá trị override sẽ được giữ qua
các lần save.

### 3.2 Re-fire gate (trong fireTrigger)

```ts
if (context.contactId && wf.reFirePolicy === "once") {
  const existing = await db.workflowRun.findFirst({
    where: { workflowId: wf.id, contactId: context.contactId },
    select: { id: true },
  });
  if (existing) continue;
}
```

`every` bỏ qua hoàn toàn check này — run đồng thời được tạo tự do.

---

## 4. Dedupe ở cấp nguồn (theo từng trigger)

Mỗi tầng nguồn của trigger có cơ chế dedupe riêng. Chính sách re-fire vận
hành ở trên tầng này; dedupe chạy TRƯỚC.

| Trigger | Cơ chế | Ở đâu | Cửa sổ |
|---|---|---|---|
| `PAGE_VISITED` | Lock Redis `SET NX EX` | `apps/renderer/app/[[...slug]]/page.tsx` + `/api/track/visit` | 1 giờ |
| `FORM_SUBMIT` | Bản ghi bảng `ContactEvent` | `apps/renderer/app/api/submit/route.ts` | 60 giây |
| `EMAIL_OPENED` | Cờ first-open (`EmailSend.openedAt IS NULL`) | `/api/email/track/open/[emailSendId]` | chỉ lần đầu |
| `EMAIL_LINK_CLICKED` | Cờ first-click (`EmailSend.clickedAt IS NULL`) | `/api/email/track/click/[token]` | chỉ lần đầu |
| `NEW_SALE` | Không có (mỗi transition PAID đều là thật) | Webhook Stripe / PayPal | — |
| `SALE_CANCELED` | Không có | Webhook | — |
| `CHECKOUT_STARTED` | Không có | `/api/checkout/intent` | — |
| `SUBSCRIPTION_PAYMENT_FAILED` | Không có (sự kiện webhook đã idempotent) | Webhook | — |
| `TAG_ADDED` / `TAG_REMOVED` | Không có (operator chủ động) | Route mutation tag | — |

### 4.1 Chống spam reload cho PAGE_VISITED

Việc reload trang khá thường xuyên (chuyển tab, back/forth). Cooldown Redis
1h với key `pv:{contactId}:{funnelStepId}` chặn các lần fire do reload cho
đến 1 giờ sau lần fire trước. Nếu không có nó, một workflow
`PAGE_VISITED → SEND_EMAIL → END` sẽ gửi email cho contact mỗi lần reload.

Lưu ý hiệu năng: Redis `SET NX EX` mất ~1ms và ~100 bytes/key. Với TTL 1h
và chỉ fire khi đã định danh (cần cookie), áp lực bộ nhớ là không đáng kể
(~50MB ở đỉnh 500k tổ hợp duy nhất mỗi giờ).

---

## 5. Mô hình định danh

### 5.1 Cookie `lt_contact`

Workflow chỉ có thể enroll một contact **đã biết** (có `contactId`). Định
danh được thiết lập tại một trong bốn điểm thu thập và lưu trong cookie
HttpOnly `lt_contact` (TTL 30 ngày, SameSite=Lax, Secure ở prod):

| Điểm thu thập | Endpoint |
|---|---|
| Click link trong email | `apps/renderer/app/api/email/track/click/[token]/route.ts` |
| Opt-in qua form funnel | `apps/renderer/app/api/submit/route.ts` (nhánh optin) |
| Khởi tạo checkout | `apps/renderer/app/api/checkout/intent/route.ts` |
| Xác nhận checkout | `apps/renderer/app/api/checkout/confirm/route.ts` (re-set phòng hờ cho PayPal) |

Helper: `setLtContactCookie(response, contactId)` trong
`apps/renderer/lib/identity-cookie.ts`.

### 5.2 Quy tắc scoping cookie (do trình duyệt ép)

Cookie KHÔNG có thuộc tính `Domain` → bị scope theo **đúng origin**. Hệ quả:

- SaaS đa khách hàng trên các domain khác nhau → cookie độc lập ✅
- Đa workspace trên các subdomain khác nhau → cookie độc lập ✅
- Đa funnel cùng domain → cookie dùng chung (giả định cùng workspace) ✅
- Truyền định danh xuyên domain → chỉ qua cầu nối email-click (không cách khác)

### 5.3 Phòng thủ xuyên workspace

Ngay cả khi cookie va chạm (chia chung root domain, hiếm), helper
`firePageVisited` kiểm tra `Contact.workspaceId === Funnel.workspaceId`
trước khi fire trigger. Cookie bị đánh cắp / cũ trỏ tới contact ở workspace
khác → bỏ qua âm thầm, không fire.

### 5.4 Khách ẩn danh

Không có cookie `lt_contact` → không fire trigger. Trang vẫn render bình
thường; chỉ PAGE_VISITED và các trigger downstream cần định danh là bị
bỏ qua. Sự kiện ẩn danh không được track riêng (không có bảng
AnonymousSession — đẩy sang Phase 2 nếu cần).

---

## 6. Loại node (Actions)

Mọi loại node được validate bởi `validateNode(type, config)`.

| Loại | Config bắt buộc | Hành vi |
|---|---|---|
| `SEND_EMAIL` | `emailId` (FK đến bản ghi `WorkflowEmail`) | Worker render body email được liên kết với biến Mustache, tạo bản ghi `EmailSend` (set FK `workflowEmailId`), enqueue gửi SMTP. Tăng `WorkflowEmail.sentCount` |
| `ADD_TAG` | `tagId` | Upsert idempotent vào `ContactTag` |
| `REMOVE_TAG` | `tagId` | Xoá bản ghi khỏi `ContactTag` nếu có (no-op nếu không có) |
| `WEBHOOK` | `url` (http/https), `method` (GET/POST/PUT/PATCH) | POST envelope JSON với type discriminator + header tuỳ chỉnh. Non-2xx → step FAILED |
| `DELAY` | Ít nhất một trong `days` / `hours` / `minutes` khác 0; tổng ≤ 365 ngày | Worker đặt lịch step tiếp theo tại `scheduledFor = now + totalMs`. Run vẫn ACTIVE trong khi chờ |
| `CONDITION` | Discriminator `kind` + các trường theo kind (xem §7) | Set `preferredLabel` thành `"true"` hoặc `"false"` — worker chọn edge ra tương ứng |
| `END` | `reason` tuỳ chọn (text tự do, ≤ ~50 ký tự) | Đánh dấu `WorkflowRun.status = COMPLETED`, `exitReason = reason` |

### 6.1 Entity WorkflowEmail

Node `SEND_EMAIL` không lưu nội dung inline — chúng tham chiếu một bản ghi
`WorkflowEmail` riêng qua `config.emailId`. Cho phép nhiều node SEND_EMAIL
chia sẻ chung một body email và cho email có analytics riêng (các bộ đếm
denormalize `sentCount`, `openedCount`, `clickedCount`).

Vòng đời:
- Thêm node SEND_EMAIL → emailId là `null`. Operator chọn một email có sẵn
  hoặc bấm "Create new email" (điều hướng tới `/emails/new`).
- Trang "Create new email" KHÔNG ghi DB cho tới khi Save — bỏ trang giữa
  chừng không để lại bản ghi orphan.
- Xoá node SEND_EMAIL → `WorkflowEmail` liên kết KHÔNG bị xoá. Có thể được
  dùng lại bởi node khác hoặc giữ làm draft. Dọn orphan qua trang
  `/workflows/[id]/emails`.
- Đổi loại từ SEND_EMAIL → ADD_TAG → email liên kết cũng KHÔNG bị xoá.

Trình soạn email (`/workflows/[id]/emails/[emailId]/edit`) chạy fullscreen,
dùng editor TipTap của maily.to, và có nút Save tường minh (không autosave).
Validation: subject không rỗng, sender đã chọn (senderId HOẶC fromName +
fromEmail), bodyHtml là một doc JSON maily không rỗng (được duyệt qua các
node text / image / button / logo bằng `isMailyDocEmpty`).

### 6.2 Định dạng nội dung SEND_EMAIL

`WorkflowEmail.bodyHtml` là **chuỗi JSON của doc TipTap maily.to**, KHÔNG
phải HTML thô. Hàm `renderEmailContent` của worker (trong
`packages/email/src/render.ts`) từ chối bất kỳ thứ gì không bắt đầu bằng
`{`. Template dùng DSL của maily (`doc`, `p`, `btn`, `link`, `bold`, …)
trong `apps/web/lib/workflow-templates.ts` để soạn body — chúng phát ra
JSON TipTap hợp lệ.

---

## 7. Các kind của CONDITION

Node `CONDITION` rẽ nhánh dựa trên `preferredLabel` mà executor set. Các
edge phải được gắn nhãn `"true"` và `"false"`; validation đồ thị ép cả hai
nhánh phải tồn tại.

| Kind | Config bắt buộc | True khi |
|---|---|---|
| `contact_tag` | `tagId`, `operator` ∈ {`has`, `does_not_have`} | Contact có (hoặc không có) tag |
| `contact_field` | `field`, `operator` ∈ {`equals`, `begins`, `contains`, `ends`}, `value` | So sánh chuỗi (không phân biệt hoa thường) trên `Contact.{field}` |
| `contact_purchased` | (`funnelStepId` tuỳ chọn) | Có `Order` nào với `status = PAID` của contact này kể từ `run.startedAt`; nếu set `funnelStepId` thì scope vào step đó |
| `email_opened` | `source` ∈ {`broadcast`, `workflow_email`} + id tương ứng | `EmailSend.openedAt ≥ run.startedAt` cho nguồn đã cấu hình. **Không có lựa chọn `"any"`** — đã bỏ vì routing trên engagement không liên quan |
| `email_clicked` | Giống `email_opened` | Cấu trúc tương tự, kiểm tra `clickedAt` thay vì `openedAt` |

Condition fail-closed: thiếu config / kind không hỗ trợ → `result = false`.

---

## 8. Quy tắc đồ thị

`validateGraph(nodes, edges, startNodeId)` ép buộc:

1. `startNodeId` phải được set và tồn tại trong `nodes`.
2. Mọi `edge.source` và `edge.target` phải tham chiếu node có thật.
3. Node `CONDITION` phải có CẢ edge ra `true` và `false`.
4. Node không phải `END` phải có ít nhất một edge ra (không có ngõ cụt).

Nhãn edge:
- Output của `CONDITION`: `"true"` / `"false"` (điều khiển việc chọn edge
  của executor qua `ctx.preferredLabel`)
- Mọi node tuyến tính khác: không có nhãn

---

## 9. Gating khi activate (khoá nghiêm ngặt kiểu Klaviyo)

Khi `Workflow.status = ACTIVE`:

### 9.1 Bảo vệ phía server
- `PATCH /api/workflows/[id]` trả **409** "Workflow is active — pause it to edit."
- `POST /api/workflows/[id]/emails` trả **409**
- `PATCH /api/workflows/[id]/emails/[emailId]` trả **409**
- `DELETE /api/workflows/[id]/emails/[emailId]` trả **409**
- Chuyển trạng thái (`/api/workflows/[id]/status`) ĐƯỢC phép (operator
  phải có thể bấm Pause).

### 9.2 Bảo vệ phía UI
- Top bar hiển thị banner khoá vàng "Workflow is active — edits are locked.
  Click Pause to make changes."
- Input tên workflow: readonly
- Selector re-fire: disabled
- Nút Save: ẩn
- Picker "+" trên các node: ẩn
- Nút Delete X trên các node: ẩn
- Phím Delete/Backspace: bị chặn qua `onNodesChangeGuarded`
- Click vào node → modal mở nhưng mọi control form đều disabled (qua
  `<fieldset disabled>` bao ngoài)
- Switcher loại node trong modal: disabled
- Link "Create new email": ẩn
- Editor email + trang listing: readonly cùng banner

### 9.3 Luồng Activate
1. Operator bấm Activate (status=DRAFT hoặc PAUSED).
2. Client chạy `validateWorkflow()` — nếu có issue, mở modal pre-flight
   liệt kê chúng, KHÔNG gọi server.
3. Nếu OK → pre-save (qua chính endpoint PATCH, vẫn hoạt động vì status
   chưa phải ACTIVE) → gọi `PATCH /api/workflows/[id]/status` với
   `{status: "ACTIVE"}` → server re-validate → 400 kèm issues[] hoặc commit.
4. Các run hiện hữu tiếp tục chạy theo snapshot đồ thị mà chúng enroll.
5. Trigger mới enroll theo config mới.

---

## 10. Ngữ nghĩa thực thi runtime

### 10.1 Vòng đời job
- Trigger fire → tạo bản ghi `WorkflowRun` (status=ACTIVE) → enqueue job
  BullMQ `workflow.step` cho `startNodeId`.
- Worker (`processWorkflowJob`) load run + workflow + contact, tìm node
  theo id và thực thi.
- Cổng vòng đời bỏ qua job nếu:
  - Run không ACTIVE (paused / completed / failed)
  - Workflow không ACTIVE (operator pause / archive giữa chừng → run
    thoát với `EXITED` + reason `workflow_<status>`)
  - `run.currentNodeId` ≠ `nodeId` của job (đồ thị bị sửa khi đang chạy
    → bỏ qua âm thầm; job được enqueue gần nhất sẽ chạy đúng node)
- Step được ghi thành bản ghi `WorkflowRunStep` (RUNNING → COMPLETED /
  FAILED / SKIPPED) để audit.
- Step tiếp theo được enqueue với `delay` tuỳ chọn từ
  `ctx.contextDelta.__delayMs`.

### 10.2 Xử lý lỗi
- Lỗi từng node: log lỗi → đánh dấu step FAILED → run vẫn tiếp tục (KHÔNG
  abort run). Cho phép lỗi WEBHOOK / SMTP tạm thời được retry bởi BullMQ
  hoặc bỏ qua mà không kết thúc run.
- Lỗi không khôi phục được phía worker: BullMQ retry tối đa 2 lần với
  exponential backoff (base 30s). Nếu cả hai đều fail, job rơi vào set
  `failed`.

### 10.3 Concurrency
- Concurrency của worker BullMQ cấu hình qua `WORKFLOW_WORKER_CONCURRENCY`
  (mặc định 8).
- Re-fire `every` cho phép cùng một contact có nhiều WorkflowRun đồng
  thời. Mỗi run có `currentNodeId`, `context`, chuỗi step riêng. Không
  cần mutex — các run là state machine độc lập.

---

## 11. Templates

`apps/web/lib/workflow-templates.ts` ship sẵn 17 template. Clone và tuỳ
biến qua gallery (`TemplateGallery.tsx`).

Phân loại:
- **Sales**: Cart Abandonment Recovery (3 bước, Flagship), Browse Abandonment (PAGE_VISITED)
- **Onboarding**: Welcome Series (3 email, Popular), Post-purchase Thank You (Popular), Lead Magnet Delivery (New)
- **Retention**: Refund Follow-up, Failed Payment Grace, FAQ Visit → Customer Support Outreach (New)
- **Re-engagement**: Re-engagement Sequence
- **Tagging**: Segment-Specific Onboarding, Engaged Reader Tagger, High-Intent Page Tagger (New)
- **Rules**: Auto-tag form leads, Trial → Paid tag swap, Refund cleanup

### 11.1 Cấu trúc template

```ts
{
  id, name, description, category, icon, badge?,
  triggerType, triggerConfig: {},  // operator điền funnel/step khi clone
  reFirePolicy?: "every" | "once",  // bỏ trống → dùng smart default theo trigger
  startNodeId,
  nodes: TemplateNode[],
  edges: TemplateEdge[],
}
```

### 11.2 Nội dung email

Node SEND_EMAIL của template mang nội dung seed trong `config.subject` +
`config.bodyHtml`. Route clone (`/api/workflows/from-template`):
1. Tạo bản ghi Workflow với `reFirePolicy` từ template HOẶC smart default
   theo `triggerType`.
2. Với mỗi node SEND_EMAIL có subject/body không rỗng, tạo một bản ghi
   `WorkflowEmail` mang nội dung đó + sender mặc định của workspace.
3. Viết lại `config` của node thành `{emailId: <newEmailId>}`, bỏ phần
   nội dung inline.

Body template dùng DSL của maily.to (`doc(p("..."), btn("CTA", "/url"), …)`)
để phát ra JSON TipTap hợp lệ. HTML thô trong template sẽ throw lúc gửi —
renderer từ chối mọi thứ không bắt đầu bằng `{`.

---

## 12. Bề mặt API

| Endpoint | Method | Mục đích | Bị khoá? |
|---|---|---|---|
| `/api/workflows` | GET | Liệt kê workflow của workspace | — |
| `/api/workflows` | POST | Tạo workflow (DRAFT) | — |
| `/api/workflows/[id]` | GET | Đọc | — |
| `/api/workflows/[id]` | PATCH | Cập nhật name / trigger / nodes / edges / reFirePolicy | 🔒 409 nếu ACTIVE |
| `/api/workflows/[id]` | DELETE | Xoá + cascade WorkflowRun | — |
| `/api/workflows/[id]/status` | PATCH | Chuyển trạng thái (DRAFT/PAUSED/ACTIVE/ARCHIVED). DRAFT/PAUSED → ACTIVE chạy lại validation | — |
| `/api/workflows/[id]/emails` | GET | Liệt kê email của workflow | — |
| `/api/workflows/[id]/emails` | POST | Tạo email trống | 🔒 409 nếu workflow cha ACTIVE |
| `/api/workflows/[id]/emails/[emailId]` | PATCH | Cập nhật nội dung email | 🔒 409 nếu workflow cha ACTIVE |
| `/api/workflows/[id]/emails/[emailId]` | DELETE | Xoá email (EmailSend.workflowEmailId được set NULL) | 🔒 409 nếu workflow cha ACTIVE |
| `/api/workflows/[id]/email-links` | GET | Trích các href riêng biệt từ bodyHtml của broadcast/workflow_email | — |
| `/api/workflows/from-template` | POST | Clone template → workflow DRAFT + các bản ghi WorkflowEmail | — |
| `/api/track/visit` | POST | Ping PAGE_VISITED phía client (thay cho fire khi render server-side) | — |

Tất cả endpoint đều scope theo workspace qua `requireWorkspaceFromSlug` /
`requireAccess`; header `X-Workspace-Slug` là bắt buộc.

---

## 13. Danh mục thông báo validation

Các chuỗi hiển thị cho operator do validator phát ra. Đây là bề mặt ổn
định — mọi test assert các chuỗi này phụ thuộc cứng vào câu chữ.

- Trigger: `"Pick a trigger type."`
- TAG_ADDED / TAG_REMOVED: `"Pick which tag this trigger watches for."`
- Triggers theo funnel: `"Pick which funnel this trigger watches."` /
  `"Pick which step in that funnel triggers the workflow."`
- Triggers theo email: `"Pick an email source (broadcast or workflow
  email)."` / `"Pick which broadcast this trigger watches for."` / `"Pick
  which workflow email this trigger watches for."`
- EMAIL_LINK_CLICKED + linkUrl không hợp lệ: `"Link filter must be a URL or URL
  substring (e.g. https://… or /path)."`
- Loại node deprecated: `"Node type "{TYPE}" is no longer supported.
  Delete this node and replace with a supported step."`
- SEND_EMAIL không có emailId: `"Pick or create an email for this step."`
- Kiểm tra nội dung WorkflowEmail: `"Email sender is not picked."` / `"Email
  subject is empty."` / `"Email body is empty."`
- Email liên kết bị mất: `"Linked email no longer exists. Pick or create a
  new one."`
- WEBHOOK URL không hợp lệ: `"URL is empty."` / `"URL must start with http://
  or https://."` / `"Method must be GET, POST, PUT, or PATCH."`
- DELAY: `"Delay values cannot be negative."` / `"Set at least 1 minute,
  hour, or day."` / `"Total delay can't exceed 365 days."`
- CONDITION: `"Condition kind not picked."` / thông báo theo từng kind
- Nguồn email của CONDITION: `"Pick an email source (broadcast or workflow
  email)."`
- Đồ thị: `"Connect the trigger to a starting step."` / `"Start node is
  missing from the graph."` / `"Edge {id} points to a missing node."` /
  `"If/else needs both a true and a false branch."` / `"Step "{LABEL}"
  has no next step. Add one or connect it to End."`

---

## 14. Biến Mustache (render SEND_EMAIL)

Có sẵn trong `subject` và `bodyHtml` (sau khi render maily). Được resolve
tại thời điểm gửi bởi worker từ `RunCtx`:

- `contact.firstName`, `contact.lastName`, `contact.email`
- `workspace.name`
- `order.*` (khi payload trigger có dữ liệu order — NEW_SALE, SALE_CANCELED)
- `unsubscribeUrl` (được tự động chèn trước khi gửi)
- Mọi key `triggerData.*` / `context.*` từ run

Panel biến trong editor (đáy của trình soạn email fullscreen) liệt kê tập
chuẩn từ `STANDARD_VARIABLES` (trong `@launchtic/email`).

---

## 15. Các pattern thường gặp

### 15.1 Thank You sau mua + Onboarding (tách workflow)
- Workflow A: `NEW_SALE → SEND_EMAIL "Thanks" → END` với `reFirePolicy: "every"`
  → fire theo từng order, run đồng thời.
- Workflow B: `NEW_SALE → DELAY 24h → SEND_EMAIL "Getting started" → END`
  với `reFirePolicy: "once"` → chỉ fire cho order đầu tiên của contact.

### 15.2 Cart abandonment recovery (kèm auto-exit)
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
Dùng `reFirePolicy: "every"` để mỗi lần thử checkout mới đều enroll.

### 15.3 Chuỗi xuyên workflow (email của workflow A → trigger workflow B)
- Workflow A gửi email E1.
- Trigger của Workflow B = `EMAIL_OPENED` với `source: "workflow_email"`,
  `workflowEmailId: E1.id`.
- Contact mở E1 → pixel tracking fire `EMAIL_OPENED` với
  `workflowEmailId = E1.id` → workflow B enroll.

### 15.4 Khách lạnh → cầu nối tag để retarget
- Workflow A: `FORM_SUBMIT → ADD_TAG "interested:productX" → END`
  (mặc định `reFirePolicy: "once"` chống re-tag).
- Workflow B: `TAG_ADDED tagId=interested:productX → SEND "Welcome" → DELAY 3d → … → END`
- Workflow C: `TAG_ADDED tagId=interested:productX → WEBHOOK Facebook Ads Custom Audience`

### 15.5 Fire một lần cho trigger khác (operator muốn "once")
Mặc định cho trigger không phải FORM_SUBMIT là `every`. Operator chuyển
selector trên top-bar sang `once` để giới hạn workflow chỉ chạy một lần
cho mỗi contact.

### 15.6 Gating workflow bằng CONDITION + tag (thay thế "once")
```
TRIGGER (bất kỳ) → CONDITION contact_tag "X_done"
                     ├─ true  → END
                     └─ false → ADD_TAG "X_done" → … → END
```
Hoạt động bất kể `reFirePolicy` — hữu ích khi bạn muốn vài side effect
chạy mỗi lần fire (ví dụ tag analytics) và vài side effect chỉ chạy một
lần.

---

## 16. Testing

Smoke test nằm tại `apps/web/scripts/`:

| File | Phạm vi |
|---|---|
| `test-source-picker.mts` | Validation thuần logic (36 test) |
| `test-source-picker-integration.mts` | Integration DB — pipeline fireTrigger + query execCondition (14 test) |
| `test-workflow-coverage.mts` | Integration DB — các condition khác, trigger khác, quy tắc đồ thị, toán DELAY, ghi DB SEND_EMAIL (37 test) |
| `test-refire-policy.mts` | Integration DB — ngữ nghĩa every (đồng thời) + once (block-all) (8 test) |
| `test-template-bodies.mts` | Validate mỗi body SEND_EMAIL template là JSON maily hợp lệ (120 check trên 24 email) |
| `test-template-render.mts` | Chạy `@maily-to/render` trên từng email template (24 email) |

Chạy riêng:
```bash
pnpm --filter @launchtic/worker exec tsx <abs-path-to-script>
```

Mọi dữ liệu test dùng namespace `smoketest_*` và tự dọn trong `finally`.

---

## 17. Tham chiếu schema

Các cột chính trên model `Workflow`:

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
  // Bộ đếm denormalize
  totalEnrolled  Int @default(0)
  activeCount    Int @default(0)
  completedCount Int @default(0)
  exitedCount    Int @default(0)
  // …timestamps, relations
}
```

`WorkflowRun`:
- `status`: ACTIVE | COMPLETED | EXITED | FAILED
- `exitReason`: text tự do — `"purchased"` / `"goal"` / `"manual"` /
  `"workflow_paused"` / `"workflow_archived"` / `config.reason` của node END
  / `"end_node"` (mặc định cho END không có nhãn)

---

## 18. Ngoài phạm vi / Phase 2

Đang được theo dõi nhưng cố ý hoãn lại:

- **Định danh + stitching khách ẩn danh** — PAGE_VISITED cho traffic lạnh
  với khách chưa từng engage qua email/form. Cần các bảng AnonymousSession
  + AnonymousEvent. Xem ghi chú research — Systeme và phần lớn đối thủ
  cũng không track cá nhân ẩn danh; hoãn lại là an toàn.
- **Bắt email khi blur cho CHECKOUT_STARTED** — fire khi blur khỏi ô email
  thay vì bấm Pay. Tăng gấp đôi bề mặt recovery nhưng cần tầng chống bot /
  email rác (regex + tra MX + rate limit Redis + danh sách domain
  disposable).
- **Cooldown N ngày cho từng workflow** — trước đây là policy re-enroll
  `COOLDOWN`. Đã gỡ vì lý do đơn giản hoá; có thể đạt được qua node DELAY
  + gate CONDITION contact_tag.
- **Webhook ngoài → trigger workflow** — fire workflow từ sự kiện của bên
  thứ ba.
- **Dashboard analytics theo workflow** — hiện chỉ có bộ đếm denormalize
  + lịch sử run. Chưa có view funnel/conversion theo workflow.
- **TTL dedupe PAGE_VISITED có thể cấu hình** — hiện đang hardcode 1h.
- **Định danh phone-first / external-userId** — mô hình hiện tại dùng
  email làm khoá duy nhất cho Contact.
