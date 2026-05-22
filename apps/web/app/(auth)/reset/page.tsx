import ResetForm from "./ResetForm";
import { getInstallationBranding } from "../../../lib/branding";

// Tab title = "Reset password — {brandName}" via root's metadata template.
// Favicon + brand title come from root layout (single-tenant install).
export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const branding = await getInstallationBranding();
  return <ResetForm brandLogoUrl={branding.logoUrl} brandName={branding.brandName} />;
}
