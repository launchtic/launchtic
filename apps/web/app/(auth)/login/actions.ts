"use server";

import { signIn } from "../../../lib/auth";
import { isDemoMode, DEMO_EMAIL, DEMO_PASSWORD } from "../../../lib/demo";

// Server action invoked by the auto-submitting form on the login page when the
// instance runs in DEMO_MODE. Signs the visitor in as the shared demo user and
// redirects into the dashboard — no credentials to type.
export async function demoEnter() {
  if (!isDemoMode()) return;
  await signIn("credentials", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: "/dashboard",
  });
}
