import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import LoginForm from "./LoginForm";
import { isDemoMode, DEMO_EMAIL, DEMO_PASSWORD } from "../../../lib/demo";
import { getInstallationBranding } from "../../../lib/branding";

// First-run gate: a fresh install has no users in the DB. Redirect callers
// to the wizard at /setup where they create the admin account + workspace;
// once that's done login resumes its normal role.
export const dynamic = "force-dynamic";

// Title prefix "Log in" gets concatenated with root's "%s — {brandName}"
// template (apps/web/app/layout.tsx generateMetadata) — so the tab shows
// e.g. "Log in — AgencyXYZ" without us setting brandName here.
export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const userCount = await db.user.count();
  if (userCount === 0) redirect("/setup");

  // Self-host: one Organization per install. Use the installation's branding
  // for login chrome (logo + favicon + tab title) so an agency's clients
  // never see launchtic at the login page.
  const branding = await getInstallationBranding();

  // In the public demo, hand the form the shared credentials so visitors can
  // one-click fill them (no auto-login — they click Sign in themselves).
  const demo = isDemoMode();

  return (
    <LoginForm
      brandLogoUrl={branding.logoUrl}
      brandName={branding.brandName}
      demoEmail={demo ? DEMO_EMAIL : undefined}
      demoPassword={demo ? DEMO_PASSWORD : undefined}
    />
  );
}
