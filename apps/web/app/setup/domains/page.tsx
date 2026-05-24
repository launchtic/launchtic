// First-run wizard Step 2 — domain configuration + DNS verify + Caddy reload.
//
// Server component preconditions:
//  - SystemConfig.setupCompletedAt unset (else send to /login)
//  - At least one User exists (else send back to Step 1)
//
// Detects the server's public IP via the same ip-detection service the CLI
// installer uses, so the page can show the DNS A records to copy verbatim
// without asking the operator to ssh into the box and run `curl ifconfig.me`.

import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { isSetupComplete } from "../../../lib/system-config";
import Step2DomainsForm from "../../../components/setup/Step2DomainsForm";

async function detectServerIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return (await res.text()).trim();
  } catch { /* fall through */ }
  try {
    const res = await fetch("https://ifconfig.me", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return (await res.text()).trim();
  } catch { /* fall through */ }
  return "";
}

export default async function SetupStep2() {
  if (await isSetupComplete()) redirect("/login");

  const userCount = await db.user.count();
  if (userCount === 0) redirect("/setup");

  const serverIp = await detectServerIp();
  return <Step2DomainsForm serverIp={serverIp} />;
}
