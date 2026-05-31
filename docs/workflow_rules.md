
## TỔNG KẾT BẢNG đầy đủ

| Trigger | Mô tả 1 dòng | Fields trong form | Filter options |
|---|---|---|---|
| **new_sale** | When an order is marked PAID | When · **Step type** · Funnel · Step | Step type: CHECKOUT / UPSELL / DOWNSELL |
| **sale_canceled** | When an order is refunded or canceled | When · **Step type** · Funnel · Step | Step type: CHECKOUT / UPSELL / DOWNSELL |
| **subscription_payment_failed** | When Stripe fails to charge a recurring sub | When | (no filter) |
| **form_submit** | When a contact submits a funnel form | When · **Step type** · Funnel · Step | Step type: OPTIN / SALES / CHECKOUT / CUSTOM |
| **checkout_started** | When visitor types email at checkout (no pay yet) | When · Funnel · Step | (step type hidden — always CHECKOUT) |
| **tag_added** | When the specified tag gets added | When · **Tag** | (no funnel scope) |
| **tag_removed** | When the specified tag gets removed | When · **Tag** | (no funnel scope) |
| **email_link_clicked** | When contact clicks any link in our email | When | (no filter) |