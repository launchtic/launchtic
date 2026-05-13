import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import LoginForm from "./LoginForm";

// First-run gate: a fresh install has no users in the DB. Redirect callers
// to /register where they create the admin account; once that's done login
// resumes its normal role.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const userCount = await db.user.count();
  if (userCount === 0) redirect("/register");
  return <LoginForm />;
}
