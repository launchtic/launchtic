import ForgotForm from "./ForgotForm";
import { getInstallationBranding } from "../../../lib/branding";

// Tab title = "Forgot password — {brandName}" via root's metadata template.
// Favicon + brand title come from root layout (single-tenant install).
export const metadata = { title: "Forgot password" };

// Skip static prerender — getInstallationBranding hits Prisma which has no
// DB connection at build time.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // In-page logo override — root metadata handles favicon, but the visible
  // logo inside the form needs branding passed explicitly. Same React.cache
  // hit as the root metadata call → no extra DB query.
  const branding = await getInstallationBranding();
  return <ForgotForm brandLogoUrl={branding.logoUrl} brandName={branding.brandName} />;
}
