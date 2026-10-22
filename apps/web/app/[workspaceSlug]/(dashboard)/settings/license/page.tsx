// LicensePanel / PurchasesPanel fetch their own data via /api/license and /api/purchases.
// Tabs keep the two kinds of key (plan license LT-…, add-on LTP-…) apart;
// the active tab lives in ?tab= so links can point straight at add-ons.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import LicensePanel from "../../../../../components/settings/LicensePanel";
import PurchasesPanel from "../../../../../components/settings/PurchasesPanel";
import VersionPanel from "../../../../../components/settings/VersionPanel";
import LicenseRefreshButton from "../../../../../components/settings/LicenseRefreshButton";

export const metadata = { title: "License & Updates" };

const TABS = [
  { id: "plan",    label: "Plan" },
  { id: "addons",  label: "Add-ons" },
  { id: "version", label: "Version" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { workspaceSlug } = await params;
  const r = await requireWorkspaceFromSlug(workspaceSlug);
  if (!r.isOwner) notFound();

  const { tab: rawTab } = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "plan";

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <div className="flex gap-6 border-b border-gray-200 mb-8">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/${workspaceSlug}/settings/license${t.id === "plan" ? "" : `?tab=${t.id}`}`}
            className={`-mb-px pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "plan" && <LicensePanel />}
      {tab === "addons" && <PurchasesPanel />}
      {tab === "version" && (
        <div className="space-y-10">
          <VersionPanel />
          <div className="pt-6 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              Re-check your plan, update window, and latest version with launchtic.com.
            </p>
            <LicenseRefreshButton />
          </div>
        </div>
      )}
    </div>
  );
}
