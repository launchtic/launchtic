// Performance test seeder. Generates contacts + orders + transactions +
// subscriptions in bulk so you can stress-test pagination/search at scale.
//
// Usage:
//   pnpm --filter @launchtic/database db:seed:perf <workspaceId> [contactCount]
//   pnpm --filter @launchtic/database db:seed:perf:clean
//
// Defaults:
//   contactCount   = 10,000
//   orders/contact = 1-6 random (avg 3.5)
//   transactions/order = 1 SALE + 20% chance of REFUND (avg ~1.2)
//   subscriptions  = 20% of contacts
//
// All seed data uses email prefix "perf-" so cleanup is safe.

import { db } from "./index";

const BATCH = 1000;
const PERF_PREFIX = "perf-";

// Each run gets a unique tag — IDs collide-proof across runs, prefix lets cleanup find everything.
const SEED_TAG = `seed-${Date.now().toString(36)}`;

function id(table: "c" | "o" | "t" | "s", i: number): string {
  return `${SEED_TAG}-${table}-${i}`;
}

// Deterministic pseudo-random offset (0 to 365 days) — keeps createdAt spread out
// without needing Math.random() so the same seed run is reproducible.
function ageMs(i: number): number {
  return ((i * 9301 + 49297) % 233280) * (365 * 24 * 3600 * 1000 / 233280);
}

function pickFirst(i: number) {
  return ["Anh","Bình","Châu","Dũng","Hà","Phong","Giang","Iris","John","Kim","Linh","Minh","Nam","Olivia","Phú","Quân"][i % 16];
}
function pickLast(i: number) {
  return ["Nguyen","Tran","Le","Pham","Hoang","Phan","Vu","Vo","Dang","Bui","Do","Ngo","Smith","Jones","Brown","Davis"][i % 16];
}
function pickCountry(i: number) {
  return ["VN","US","UK","DE","FR","JP","SG","AU","CA","TH"][i % 10];
}
function pickOrderStatus(i: number) {
  // Skewed toward PAID to look realistic
  const s = ["PAID","PAID","PAID","PAID","PAID","PAID","PAID","PENDING","FAILED","REFUNDED","CANCELED","TRIAL"] as const;
  return s[i % s.length];
}
function pickSubStatus(i: number) {
  const s = ["ACTIVE","ACTIVE","ACTIVE","ACTIVE","TRIALING","PAST_DUE","CANCELED","INCOMPLETE"] as const;
  return s[i % s.length];
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--clean") {
    return cleanup();
  }

  const workspaceId = args[0];
  const contactCount = parseInt(args[1] ?? "10000");

  if (!workspaceId || isNaN(contactCount) || contactCount <= 0) {
    console.error("Usage:");
    console.error("  pnpm tsx src/seed-perf.ts <workspaceId> [contactCount=10000]");
    console.error("  pnpm tsx src/seed-perf.ts --clean");
    console.error();
    console.error("Available workspaces:");
    const all = await db.workspace.findMany({ select: { id: true, name: true } });
    all.forEach((w) => console.error(`  ${w.id}  "${w.name}"`));
    process.exit(1);
  }

  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) {
    console.error(`Workspace ${workspaceId} not found.`);
    process.exit(1);
  }

  console.log(`\n🚀 Seeding performance data into "${ws.name}"`);
  console.log(`   Tag: ${SEED_TAG}`);
  console.log(`   Contacts: ${contactCount.toLocaleString()}`);
  console.log();

  const t0 = Date.now();

  // ─── 1. Contacts ──────────────────────────────────────────────────────
  console.log("[1/4] Contacts...");
  const contactIds: string[] = [];
  for (let i = 0; i < contactCount; i += BATCH) {
    const size = Math.min(BATCH, contactCount - i);
    const data = Array.from({ length: size }, (_, j) => {
      const idx = i + j;
      const cid = id("c", idx);
      contactIds.push(cid);
      return {
        id: cid,
        workspaceId,
        email: `${PERF_PREFIX}${SEED_TAG}-${idx}@example.com`,
        firstName: pickFirst(idx),
        lastName: pickLast(idx),
        country: pickCountry(idx),
        createdAt: new Date(Date.now() - ageMs(idx)),
      };
    });
    await db.contact.createMany({ data });
    process.stdout.write(`\r       ${Math.min(i + size, contactCount).toLocaleString()} / ${contactCount.toLocaleString()}`);
  }
  console.log();

  // ─── 2. Orders ────────────────────────────────────────────────────────
  console.log("[2/4] Orders...");
  const orderIds: string[] = [];
  let orderIdx = 0;
  let orderBatch: any[] = [];

  async function flushOrders() {
    if (orderBatch.length === 0) return;
    await db.order.createMany({ data: orderBatch });
    process.stdout.write(`\r       ${orderIdx.toLocaleString()} orders`);
    orderBatch = [];
  }

  for (let ci = 0; ci < contactIds.length; ci++) {
    const cid = contactIds[ci];
    const n = 1 + (ci % 6); // 1-6 orders deterministically
    for (let k = 0; k < n; k++) {
      const oid = id("o", orderIdx);
      orderIds.push(oid);
      const subtotal = 1000 + ((orderIdx * 137) % 49) * 100;
      orderBatch.push({
        id: oid,
        workspaceId,
        contactId: cid,
        status: pickOrderStatus(orderIdx),
        paymentProvider: orderIdx % 3 === 0 ? "paypal" : "stripe",
        subtotal,
        total: subtotal,
        currency: "USD",
        isRenewal: orderIdx % 7 === 0,
        createdAt: new Date(Date.now() - ageMs(orderIdx + 1)),
      });
      orderIdx++;
      if (orderBatch.length >= BATCH) await flushOrders();
    }
  }
  await flushOrders();
  console.log();

  // ─── 3. Transactions ─────────────────────────────────────────────────
  console.log("[3/4] Transactions...");
  let txIdx = 0;
  let txBatch: any[] = [];

  async function flushTx() {
    if (txBatch.length === 0) return;
    await db.transaction.createMany({ data: txBatch });
    process.stdout.write(`\r       ${txIdx.toLocaleString()} transactions`);
    txBatch = [];
  }

  for (const oid of orderIds) {
    txBatch.push({
      id: id("t", txIdx),
      orderId: oid,
      type: "SALE" as const,
      amount: 1000 + ((txIdx * 137) % 49) * 100,
      currency: "USD",
      status: txIdx % 25 === 0 ? "FAILED" as const : "COMPLETED" as const,
      reference: `ch_${SEED_TAG}_${txIdx}`,
      createdAt: new Date(Date.now() - ageMs(txIdx + 2)),
    });
    txIdx++;
    // 20% chance of refund
    if (txIdx % 5 === 0) {
      txBatch.push({
        id: id("t", txIdx),
        orderId: oid,
        type: "REFUND" as const,
        amount: 1000,
        currency: "USD",
        status: "COMPLETED" as const,
        reference: `re_${SEED_TAG}_${txIdx}`,
        createdAt: new Date(),
      });
      txIdx++;
    }
    if (txBatch.length >= BATCH) await flushTx();
  }
  await flushTx();
  console.log();

  // ─── 4. Subscriptions (20% of contacts) ──────────────────────────────
  console.log("[4/4] Subscriptions...");
  const subCount = Math.floor(contactCount * 0.2);
  let subIdx = 0;
  let subBatch: any[] = [];

  async function flushSubs() {
    if (subBatch.length === 0) return;
    await db.subscription.createMany({ data: subBatch });
    process.stdout.write(`\r       ${subIdx.toLocaleString()} / ${subCount.toLocaleString()}`);
    subBatch = [];
  }

  for (let i = 0; i < subCount; i++) {
    const planIdx = i % 3;
    subBatch.push({
      id: id("s", i),
      workspaceId,
      contactId: contactIds[i],
      status: pickSubStatus(i),
      paymentProvider: i % 3 === 0 ? "paypal" : "stripe",
      providerSubId: `sub_${SEED_TAG}_${i}`,
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      cancelAtPeriodEnd: i % 11 === 0,
      planSnapshot: {
        planName: ["Starter", "Pro", "Business"][planIdx],
        amount: [999, 2999, 9999][planIdx],
        finalAmount: [999, 2999, 9999][planIdx],
        currency: "USD",
        interval: i % 2 === 0 ? "month" : "year",
      },
      createdAt: new Date(Date.now() - ageMs(i + 3)),
    });
    subIdx++;
    if (subBatch.length >= BATCH) await flushSubs();
  }
  await flushSubs();
  console.log();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log();
  console.log(`✓ Done in ${elapsed}s`);
  console.log(`  ${contactIds.length.toLocaleString()} contacts`);
  console.log(`  ${orderIds.length.toLocaleString()} orders`);
  console.log(`  ${txIdx.toLocaleString()} transactions`);
  console.log(`  ${subIdx.toLocaleString()} subscriptions`);
  console.log();
  console.log(`To delete ALL perf seed data (any run):`);
  console.log(`  pnpm tsx src/seed-perf.ts --clean`);
}

async function cleanup() {
  console.log("\n🧹 Deleting all perf-* seed data...");
  const t0 = Date.now();

  // Find all perf contacts in chunks (PG IN-list limit ~32k params)
  const contactIds: string[] = [];
  let cursor: string | null = null;
  while (true) {
    const rows: { id: string }[] = await db.contact.findMany({
      where: { email: { startsWith: PERF_PREFIX } },
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    contactIds.push(...rows.map((r) => r.id));
    cursor = rows[rows.length - 1].id;
    if (rows.length < 5000) break;
  }

  console.log(`  Found ${contactIds.length.toLocaleString()} perf contacts`);
  if (contactIds.length === 0) return;

  // Helper to chunk IN-list deletes
  async function chunkDelete<T extends "transaction" | "order" | "subscription" | "contact">(
    label: string,
    delegate: T,
    where: (chunk: string[]) => any,
  ) {
    let total = 0;
    for (let i = 0; i < contactIds.length; i += 1000) {
      const chunk = contactIds.slice(i, i + 1000);
      // @ts-expect-error — dynamic delegate access
      const result = await db[delegate].deleteMany({ where: where(chunk) });
      total += result.count;
      process.stdout.write(`\r  ${label}: ${total.toLocaleString()}`);
    }
    console.log();
  }

  await chunkDelete("Transactions", "transaction", (chunk) => ({
    order: { contactId: { in: chunk } },
  }));
  await chunkDelete("Orders", "order", (chunk) => ({
    contactId: { in: chunk },
  }));
  await chunkDelete("Subscriptions", "subscription", (chunk) => ({
    contactId: { in: chunk },
  }));
  await chunkDelete("Contacts", "contact", (chunk) => ({
    id: { in: chunk },
  }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Cleanup complete in ${elapsed}s`);
}

main()
  .catch((e) => {
    console.error("\n✗ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
