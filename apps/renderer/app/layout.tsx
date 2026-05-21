import "./globals.css";

export default function RendererLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning on <body> tolerates attributes that browser
  // extensions (ColorZilla, Grammarly, dark-mode addons, etc.) inject before
  // React hydrates — e.g. cz-shortcut-listen, data-new-gr-c-s-check-loaded.
  // The mismatch is benign and only affects the body element's own attrs.
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
