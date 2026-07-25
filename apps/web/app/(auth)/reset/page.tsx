import ResetForm from "./ResetForm";
import { getInstallationBranding } from "@launchtic/ee";

// Tab title = "Reset password — {brandName}" via root's metadata template.
// Favicon + brand title come from root layout (single-tenant install).
export const metadata = { title: "Reset password" };

// Skip static prerender — getInstallationBranding hits Prisma which has no
// DB connection at build time.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const branding = await getInstallationBranding();
  return <ResetForm brandLogoUrl={branding.logoUrl} brandName={branding.brandName} />;
}
