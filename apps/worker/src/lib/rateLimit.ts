// Per-workspace rate limiting primitives backed by Redis.
//
// Used by the email worker to enforce SmtpConfig.maxPerSecond / maxConcurrent /
// maxPerDay without coupling them to BullMQ's global limiter (which is shared
// across all workspaces).
//
// All keys are scoped to workspaceId so multi-tenant workers can't bleed quota.

import type { Redis } from "ioredis";

const RATE_SEC_PREFIX = "rate:sec:";
const RATE_DAY_PREFIX = "rate:day:";
const CONCURRENT_PREFIX = "rate:active:";
const CONCURRENT_TTL_SEC = 60; // safety: auto-release if a worker dies mid-job

function dayKey(workspaceId: string): string {
  // UTC calendar day. Good enough — exact midnight rollover is not critical
  // and avoids per-workspace timezone wiring.
  const today = new Date().toISOString().slice(0, 10);
  return `${RATE_DAY_PREFIX}${workspaceId}:${today}`;
}

// Per-second token bucket (fixed window). Returns true if the caller may
// proceed, false if rate-limited. Atomic via INCR.
export async function tryAcquirePerSecond(
  redis: Redis,
  workspaceId: string,
  max: number,
): Promise<boolean> {
  const key = `${RATE_SEC_PREFIX}${workspaceId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 1);
  if (count > max) {
    // Don't decrement — the window expires naturally in 1s.
    return false;
  }
  return true;
}

// Concurrent-job semaphore. Returns true if a slot was acquired.
// Caller MUST call releaseConcurrent in a finally block.
export async function tryAcquireConcurrent(
  redis: Redis,
  workspaceId: string,
  max: number,
): Promise<boolean> {
  const key = `${CONCURRENT_PREFIX}${workspaceId}`;
  const count = await redis.incr(key);
  await redis.expire(key, CONCURRENT_TTL_SEC);
  if (count > max) {
    await redis.decr(key);
    return false;
  }
  return true;
}

export async function releaseConcurrent(
  redis: Redis,
  workspaceId: string,
): Promise<void> {
  const key = `${CONCURRENT_PREFIX}${workspaceId}`;
  // Don't go below zero (e.g., on TTL expiry race).
  const count = await redis.decr(key);
  if (count < 0) await redis.set(key, 0);
}

// Read-only check for the daily quota. Does NOT increment — caller increments
// on actual successful send so failed/retried jobs don't burn quota slots.
export async function isUnderDailyQuota(
  redis: Redis,
  workspaceId: string,
  max: number,
): Promise<boolean> {
  const raw = await redis.get(dayKey(workspaceId));
  const used = raw ? parseInt(raw, 10) : 0;
  return used < max;
}

export async function recordDailySend(
  redis: Redis,
  workspaceId: string,
): Promise<void> {
  const key = dayKey(workspaceId);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 25 * 3600);
}
