import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import RegisterForm from "./RegisterForm";

// Single-tenant install: registration is the first-run admin setup, not
// a public signup. Block the page once any user exists. The matching
// guard in /api/auth/register defends the backend.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const userCount = await db.user.count();
  if (userCount > 0) redirect("/login");
  return <RegisterForm />;
}
