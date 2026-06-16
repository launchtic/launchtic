// Curated web-safe email fonts the customer can pick per email. Web-safe only:
// Outlook desktop + Gmail strip @font-face, so these render the same for every
// recipient. Shared by the editor (CSS stack) + the MJML render (font-family).

export const EMAIL_FONTS = [
  // Sans-serif
  { name: "Arial",           fontFamily: "Arial",                fallback: "Helvetica, sans-serif" },
  { name: "Helvetica",       fontFamily: "Helvetica",            fallback: "Arial, sans-serif" },
  { name: "Verdana",         fontFamily: "Verdana",              fallback: "Geneva, sans-serif" },
  { name: "Tahoma",          fontFamily: "Tahoma",               fallback: "Verdana, sans-serif" },
  { name: "Trebuchet MS",    fontFamily: "Trebuchet MS",         fallback: "Helvetica, sans-serif" },
  { name: "Lucida Sans",     fontFamily: "Lucida Sans Unicode",  fallback: "'Lucida Grande', Geneva, Verdana, sans-serif" },
  // Serif
  { name: "Georgia",         fontFamily: "Georgia",              fallback: "'Times New Roman', serif" },
  { name: "Times New Roman", fontFamily: "Times New Roman",      fallback: "Times, serif" },
  { name: "Palatino",        fontFamily: "Palatino Linotype",    fallback: "Palatino, 'Book Antiqua', serif" },
  { name: "Garamond",        fontFamily: "Garamond",             fallback: "Baskerville, 'Times New Roman', serif" },
  // Monospace
  { name: "Courier New",     fontFamily: "Courier New",          fallback: "Courier, monospace" },
] as const;

export const DEFAULT_EMAIL_FONT = "Arial";

function resolveFont(font?: string | null) {
  return EMAIL_FONTS.find((f) => f.name === font) ?? EMAIL_FONTS[0];
}

// Full CSS font-family stack (multi-word names quoted) — editor + MJML.
export function emailFontCss(font?: string | null): string {
  const f = resolveFont(font);
  const primary = f.fontFamily.includes(" ") ? `'${f.fontFamily}'` : f.fontFamily;
  return `${primary}, ${f.fallback}`;
}
