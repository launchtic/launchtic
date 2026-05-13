import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

function fmt(amount: number, currency: string) {
  return (amount / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
}

export async function GET(_req: NextRequest, { params }: Props) {
  const r = await requireAccess();
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { id } = await params;

  const order = await db.order.findFirst({
    where: { id, workspaceId },
    include: { contact: true },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snap = order.orderItemSnapshot as any;
  const shipping = order.shippingAddress as any;
  const contactName = [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ") || order.contact.email;
  const shortId = order.id.slice(-8).toUpperCase();
  const isPhysical = !!order.physicalProductId;
  const itemName = snap?.productName ?? snap?.planName ?? "—";
  const unitPrice = snap?.unitPrice ?? (order.quantity > 0 ? order.subtotal / order.quantity : order.subtotal);

  const statusColor: Record<string, string> = {
    PAID: "#166534;background:#dcfce7",
    PENDING: "#92400e;background:#fef3c7",
    FAILED: "#991b1b;background:#fee2e2",
    REFUNDED: "#5b21b6;background:#ede9fe",
  };
  const badgeStyle = statusColor[order.status] ?? "#374151;background:#f3f4f6";

  const discountRow = order.discountAmount > 0
    ? `<div class="total-row"><span>Discount${order.couponCode ? ` (${order.couponCode})` : ""}</span><span>-${fmt(order.discountAmount, order.currency)}</span></div>`
    : "";

  const shippingFee = (order as any).shippingFee ?? 0;
  const shippingRow = shippingFee > 0
    ? `<div class="total-row"><span>Shipping</span><span>${fmt(shippingFee, order.currency)}</span></div>`
    : "";

  const qtyCol = isPhysical ? `<th style="text-align:center">Qty</th>` : "";
  const qtyCell = isPhysical ? `<td style="text-align:center">${order.quantity}</td>` : "";

  const subLines = [
    snap?.variantName ? `<div class="item-sub">${snap.variantName}</div>` : "",
    snap?.sku ? `<div class="item-sub">SKU: ${snap.sku}</div>` : "",
    (snap?.planType && !isPhysical) ? `<div class="item-sub" style="text-transform:capitalize">${snap.planType.replace("_", " ").toLowerCase()}</div>` : "",
  ].join("");

  const shipSection = shipping ? `
    <div>
      <div class="party-label">Ship To</div>
      ${shipping.line1 ? `<div class="party-name">${shipping.line1}</div>` : ""}
      <div class="party-detail">${[shipping.city, shipping.state, shipping.postal_code].filter(Boolean).join(", ")}</div>
      ${shipping.country ? `<div class="party-detail">${shipping.country}</div>` : ""}
    </div>` : `
    <div>
      <div class="party-label">Payment</div>
      <div class="party-detail" style="text-transform:capitalize">${order.paymentProvider}</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice #${shortId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #f8fafc; }
    .page { max-width: 720px; margin: 32px auto; padding: 48px 48px; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .brand { font-size: 24px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.5px; }
    .invoice-meta { text-align: right; }
    .invoice-meta h1 { font-size: 28px; font-weight: 700; color: #111; }
    .invoice-meta p { font-size: 13px; color: #666; margin-top: 4px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 8px; color: ${badgeStyle}; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 36px; padding: 24px; background: #f8fafc; border-radius: 12px; }
    .party-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 8px; }
    .party-name { font-size: 15px; font-weight: 600; color: #111; }
    .party-detail { font-size: 13px; color: #555; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
    thead th:last-child, tbody td:last-child { text-align: right; }
    tbody td { padding: 16px 12px; font-size: 14px; color: #333; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .item-name { font-weight: 600; color: #111; margin-bottom: 2px; }
    .item-sub { font-size: 12px; color: #888; margin-top: 2px; }
    .totals { margin-left: auto; width: 280px; margin-top: 20px; }
    .total-row { display: flex; justify-content: space-between; font-size: 14px; color: #555; padding: 5px 0; }
    .total-row.divider { border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 12px; }
    .total-row.grand { font-size: 17px; font-weight: 700; color: #111; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
    .footer span { font-size: 12px; color: #aaa; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; padding: 12px 24px; background: #1d4ed8; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(29,78,216,0.35); }
    .print-btn:hover { background: #1e40af; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; box-shadow: none; border-radius: 0; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <div class="page">
    <div class="header">
      <div class="brand">INVOICE</div>
      <div class="invoice-meta">
        <h1>#${shortId}</h1>
        <p>${new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        <span class="badge">${order.status.charAt(0) + order.status.slice(1).toLowerCase()}</span>
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="party-label">Bill To</div>
        <div class="party-name">${contactName}</div>
        <div class="party-detail">${order.contact.email}</div>
        ${order.contact.phone ? `<div class="party-detail">${order.contact.phone}</div>` : ""}
      </div>
      ${shipSection}
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          ${qtyCol}
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="item-name">${itemName}</div>
            ${subLines}
          </td>
          ${qtyCell}
          <td>${fmt(unitPrice, order.currency)}</td>
          <td>${fmt(order.subtotal, order.currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>${fmt(order.subtotal, order.currency)}</span></div>
      ${discountRow}
      ${shippingRow}
      <div class="total-row divider grand"><span>Total</span><span>${fmt(order.total, order.currency)}</span></div>
    </div>

    <div class="footer">
      <span>Order: ${order.id}</span>
      <span>${order.providerOrderId ? `Ref: ${order.providerOrderId}` : ""}</span>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
