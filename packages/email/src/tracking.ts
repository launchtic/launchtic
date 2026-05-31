// Email tracking pixel + link rewriter.
//
// Two transformations applied right before SMTP delivery:
//   1. Every http(s) <a href="…"> in the rendered HTML is replaced with a
//      tracking redirect URL pointing at the renderer. The original URL is
//      kept in a returned token map so the caller can persist EmailSendLink
//      rows in the same transaction as the EmailSend send.
//   2. A 1x1 transparent GIF <img> tag is appended before </body> (or at the
//      end if no </body>) so opening the email triggers the open endpoint.
//
// The unsubscribe URL is left alone — it's a single contact-specific link
// that's already audited via the unsubscribe endpoint, and rewriting it
// would force every recipient through an extra hop.

import { randomBytes } from "crypto";

export type ExtractedLink = {
  token: string;
  url:   string;
};

export type TrackingResult = {
  html:  string;
  links: ExtractedLink[];
};

const TOKEN_BYTES = 9; // base64url → 12 chars, ~6e13 combinations

function generateToken(): string {
  // base64url for URL-safe tokens. randomBytes is cryptographically strong;
  // we don't need it for security here, but collisions on short tokens
  // benefit from the entropy.
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// Pattern matches `href="<http(s) URL>"` or `href='<http(s) URL>'`. Skips
// mailto:, tel:, anchor (#…), and javascript: URLs. Also skips URLs that
// already point at the tracking endpoint (idempotent — re-tracking would
// double-wrap which breaks click logging).
const HREF_RE = /href=(["'])(https?:\/\/[^"']+)\1/gi;

// Look for {{unsubscribeUrl}} literal OR rendered unsubscribe path so we
// don't rewrite the unsubscribe link. The unsubscribe URL format is
// `<appUrl>/u/<contactId>/<token>` (see buildUnsubscribeUrl in email/server).
function isUnsubscribeUrl(url: string): boolean {
  if (url.includes("{{unsubscribeUrl}}")) return true;
  // Rough match for `/u/<id>/<token>` paths — broad enough to catch both the
  // dashboard and renderer-served variants.
  return /\/u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/i.test(url);
}

function isAlreadyTracked(url: string): boolean {
  return url.includes("/api/email/track/");
}

export function injectTracking(
  html:        string,
  emailSendId: string,
  trackingBaseUrl: string,
): TrackingResult {
  const links: ExtractedLink[] = [];
  const base  = trackingBaseUrl.replace(/\/+$/, ""); // strip trailing slash

  const rewritten = html.replace(HREF_RE, (match, quote: string, url: string) => {
    if (isUnsubscribeUrl(url) || isAlreadyTracked(url)) return match;
    const token = generateToken();
    links.push({ token, url });
    return `href=${quote}${base}/api/email/track/click/${token}${quote}`;
  });

  // Open pixel — display:block prevents Outlook stretching the img. alt=""
  // tells screen readers it's decorative. `border:0` and `outline:0` keep
  // Gmail from rendering a hairline outline.
  const pixel =
    `<img src="${base}/api/email/track/open/${emailSendId}" ` +
    `alt="" width="1" height="1" ` +
    `style="display:block;width:1px;height:1px;border:0;outline:0;" />`;

  const html2 = rewritten.includes("</body>")
    ? rewritten.replace("</body>", `${pixel}</body>`)
    : rewritten + pixel;

  return { html: html2, links };
}
