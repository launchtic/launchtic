import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "../components/SessionProviderWrapper";
import { getInstallationBranding } from "@launchtic/ee";

// Root metadata — applies to EVERY page (auth, dashboard, editor, errors).
// Self-host invariant: one Organization per install, so a single read here
// captures the agency's branding for the whole app. SaaS multi-tenant
// later: keep this as launchtic defaults and override per-segment via
// segment-level generateMetadata.
//
// `getInstallationBranding` is React.cache()-wrapped, so this call is
// shared with any other component in the same request that also reads
// installation branding — single DB hit per request.
//
// When an org has no agency-tier license (or licence expired), branding
// resolves to launchtic defaults automatically — no special-casing needed.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getInstallationBranding();
  const brand = branding.brandName; // "launchtic" when no override
  return {
    title: {
      default:  brand,
      template: `%s — ${brand}`,
    },
    description: "Marketing Automation Platform",
    // Only override icon when an agency uploaded one. Otherwise Next.js
    // keeps using app/icon.svg (the built-in launchtic mark).
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
