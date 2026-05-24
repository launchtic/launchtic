import { createHmac, timingSafeEqual } from "crypto";

// Signed unsubscribe tokens. Used by every email send (broadcast / sequence /
// automation) to embed a per-contact opt-out link the recipient can click.
//
// Format: `<contactId>.<sig>` where `sig` is a base64url-encoded HMAC-SHA256
// of `unsubscribe:<contactId>` keyed on ENCRYPTION_KEY (the same secret that
// already encrypts SMTP passwords; domain-separated by the "unsubscribe:"
// prefix so signatures from one purpose can't be replayed for another).
//
// We deliberately don't include a timestamp / expiry — recipients clicking an
// old email N months later still need a working unsubscribe link, that's
// CAN-SPAM-compliant behavior. Compromise of the key = need to rotate
// ENCRYPTION_KEY (which would break SMTP passwords too — pick a strong one).

function getSecret(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) throw new Error("ENCRYPTION_KEY env var is not set");
  // Use the raw bytes — for HMAC, key length doesn't have to match block size.
  return raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "utf8");
}

function sign(contactId: string): string {
  return createHmac("sha256", getSecret())
    .update(`unsubscribe:${contactId}`)
    .digest("base64url");
}

export function buildUnsubscribeToken(contactId: string): string {
  return `${contactId}.${sign(contactId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const contactId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(contactId);
  // Constant-time compare — both are base64url, same length when valid.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? contactId : null;
}

// Build the full URL embedded in outgoing emails. Prefer passing baseUrl
// (fetched from SystemConfig by the caller) so the wizard can update the
// dashboard domain at runtime without restart. Falls back to APP_URL env
// var for legacy callers that haven't migrated yet.
export function buildUnsubscribeUrl(contactId: string, baseUrl?: string): string {
  const base = (baseUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/unsubscribe?token=${buildUnsubscribeToken(contactId)}`;
}
