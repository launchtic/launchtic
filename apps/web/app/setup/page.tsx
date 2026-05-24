// First-run wizard Step 1 — create admin account.
//
// Server component checks state first:
//  - If SystemConfig.setupCompletedAt is set → setup already done, send to /login
//  - If any User exists → admin already created, jump straight to Step 2
//  - Else render the Step 1 form

import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { isSetupComplete } from "../../lib/system-config";
import Step1AdminForm from "../../components/setup/Step1AdminForm";

export default async function SetupStep1() {
  if (await isSetupComplete()) redirect("/login");

  const userCount = await db.user.count();
  if (userCount > 0) redirect("/setup/domains");

  return <Step1AdminForm />;
}
