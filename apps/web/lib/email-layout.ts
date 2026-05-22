// Shared HTML email layout for system emails (password reset, team invite,
// future: welcome, license activation, etc.). All system emails go through
// `renderSystemEmail` so they look consistent and respect white-label
// branding when an Agency-tier license is active.
//
// Design follows the launchtic-com mailer:
//   - Dark navy header with brand logo (or text wordmark fallback)
//   - White card with title + body content
//   - Optional CTA button (primary action)
//   - Footer with subdued copyright
//
// Inline styles only — most email clients strip <style> tags + ignore
// classes. Width capped at 560px (industry standard) for mobile clients.

export type EmailBranding = {
  brandName:    string;        // "launchtic" by default, agency name when overridden
  // ABSOLUTE URL to the logo on a dark background. Caller is responsible for
  // making the URL absolute (prepend host) when branding.logoLightUrl /
  // logoUrl is relative — email clients fetch over HTTP and can't resolve
  // app-relative paths.
  logoUrl:      string | null;
};

export type SystemEmailOpts = {
  brand:        EmailBranding;
  preheader?:   string;       // tiny preview text email clients show in inbox list
  title:        string;       // h1 inside the card
  intro?:       string;       // optional small sub-line under the title
  bodyHtml:     string;       // pre-rendered HTML for the main content (paragraphs, lists, etc.)
  cta?: {
    label:      string;
    url:        string;       // absolute URL
  };
  footerNote?:  string;       // optional small italic line above the copyright
};

export function renderSystemEmail(opts: SystemEmailOpts): string {
  const year = new Date().getFullYear();
  const brand = opts.brand;

  // Header brand element — image when an agency logo is configured (on a
  // CDN reachable by email clients), otherwise a styled text wordmark.
  // Mirrors the launchtic-com fallback style (gray + blue accent).
  const headerBrandHtml = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.brandName)}" style="height:28px;width:auto;max-width:200px;display:block;" />`
    : `<span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${esc(brand.brandName)}<span style="color:#3b82f6;">.</span></span>`;

  const ctaHtml = opts.cta
    ? `<a href="${esc(opts.cta.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">${esc(opts.cta.label)}</a>`
    : "";

  // Preheader = hidden preview text (Gmail/Apple Mail show in list view).
  // The <div> with 0-height keeps it out of the rendered body but readable
  // by inbox preview crawlers.
  const preheaderHtml = opts.preheader
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(opts.preheader)}</div>`
    : "";

  const introHtml = opts.intro
    ? `<p style="margin:0 0 32px;font-size:15px;color:#64748b;line-height:1.6;">${opts.intro}</p>`
    : "";

  const footerNoteHtml = opts.footerNote
    ? `<p style="margin:0 0 6px;font-size:12px;color:#94a3b8;font-style:italic;">${esc(opts.footerNote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#0f172a;">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;">
              ${headerBrandHtml}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${esc(opts.title)}
              </p>
              ${introHtml}

              ${opts.bodyHtml}

              ${ctaHtml ? `<div style="margin-top:24px;">${ctaHtml}</div>` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f1f5f9;">
              ${footerNoteHtml}
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${year} ${esc(brand.brandName)}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// HTML-escape a value before interpolation. Only call on strings that
// originate from user input — pre-built HTML chunks (bodyHtml) must be
// trusted by the caller.
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Make a relative-or-absolute branding URL absolute, suitable for email
 * <img src>. Email clients live outside our app and can't resolve "/uploads/x";
 * they need a full http(s) URL.
 *
 * Pass the request origin (e.g. "https://app.agency.com") as `origin`.
 * Returns null when input is null (caller falls back to text wordmark).
 */
export function absolutizeBrandUrl(url: string | null, origin: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;        // already absolute (agency CDN)
  if (url.startsWith("//")) return `https:${url}`;  // protocol-relative
  if (url.startsWith("/")) return `${origin}${url}`;
  return `${origin}/${url}`;
}
