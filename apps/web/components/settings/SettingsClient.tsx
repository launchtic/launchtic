"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Globe, CreditCard, Mail, HardDrive, LayoutTemplate, Bot, Key,
  Building2, UserCircle, Settings2, ChevronRight, ChevronLeft, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ProfilePanel       from "./ProfilePanel";
import GeneralPanel       from "./GeneralPanel";
import DomainsPanel       from "./DomainsPanel";
import PaymentPanel       from "./PaymentPanel";
import EmailSettings      from "./EmailSettings";
import StoragePanel       from "./StoragePanel";
import PageTemplatesPanel from "./PageTemplatesPanel";
import AiAssistantPanel   from "./AiAssistantPanel";
import LicensePanel       from "./LicensePanel";
import WorkspacePanel     from "./WorkspacePanel";
import TeamPanel          from "./TeamPanel";

type Domain         = { id: string; domain: string; verified: boolean; isDefault: boolean; createdAt: string };
type TeamMember     = { userId: string; role: string; joinedAt: string; user: { id: string; name: string | null; email: string; avatar: string | null } };
type StripeData     = { publishableKey: string; secretKey: string; webhookSecret: string | null; mode: string } | null;
type PaypalData     = { clientId: string; clientSecret: string; webhookId: string | null; mode: string } | null;
type SmtpData       = { provider: string; host: string; port: number; username: string; password: string; maxPerDay: number; maxPerSecond?: number; maxConcurrent?: number } | null;
type StorageData    = { driver: "local" | "s3"; endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; publicUrl: string } | null;
type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };

type NavItemDef = {
  id:        string;
  label:     string;
  icon:      LucideIcon;
  proOnly?:  boolean;
  freeOnly?: boolean;
};

const NAV_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  {
    label: "ACCOUNT",
    items: [
      { id: "profile", label: "Profile", icon: UserCircle },
      { id: "general", label: "General", icon: Settings2, freeOnly: true },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { id: "workspaces",     label: "Workspaces",      icon: Building2,    proOnly: true  },
      { id: "team",           label: "Team",            icon: Users,        proOnly: true  },
      { id: "domains",        label: "Custom Domains",   icon: Globe                       },
      { id: "payment",        label: "Payment Settings", icon: CreditCard                  },
      { id: "email",          label: "Email Settings",   icon: Mail                        },
      { id: "storage",        label: "Storage",          icon: HardDrive                   },
      { id: "page-templates", label: "Page Templates",   icon: LayoutTemplate              },
      { id: "ai-assistant",   label: "AI Assistant",     icon: Bot                         },
      { id: "license",        label: "License",          icon: Key                         },
    ],
  },
];

export default function SettingsClient({
  domains, stripe, paypal, smtp, storage, senderIdentities, rendererUrl, rendererHost,
  currentWorkspaceId, currentWorkspaceSlug, workspacePlan, userId, workspaces,
  userName, userEmail, teamMembers, currentUserRole,
}: {
  domains:          Domain[];
  stripe:           StripeData;
  paypal:           PaypalData;
  smtp:             SmtpData;
  storage:          StorageData;
  senderIdentities: SenderIdentity[];
  rendererUrl:      string;
  rendererHost:     string;
  currentWorkspaceId:   string;
  currentWorkspaceSlug: string;
  workspacePlan:        string;
  userId:               string;
  workspaces: { id: string; name: string; slug: string; ownerId: string; userRole: string }[];
  userName:        string;
  userEmail:       string;
  teamMembers:     TeamMember[];
  currentUserRole: string;
}) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const isPro        = workspacePlan === "PRO" || workspacePlan === "ENTERPRISE";

  // Filter items based on plan.
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.proOnly  && !isPro) return false;
      if (item.freeOnly &&  isPro) return false;
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  const allVisibleItems = visibleSections.flatMap((s) => s.items);
  type Section = typeof allVisibleItems[number]["id"];

  const tabParam   = searchParams.get("tab") as Section | null;
  const allowedIds = allVisibleItems.map((n) => n.id);
  // Derive `active` directly from the URL — useState would only initialize
  // once, so external nav (e.g. an <a href="?tab=ai-assistant"> from another
  // component) wouldn't switch the tab. searchParams is reactive in Next so
  // any URL change re-renders with the new value.
  const active: Section =
    tabParam && allowedIds.includes(tabParam) ? tabParam : "profile";
  const [mobileView, setMobileView] = useState<"nav" | "content">("nav");

  const activeItem = allVisibleItems.find((n) => n.id === active) ?? allVisibleItems[0];

  function handleSelect(id: Section) {
    setMobileView("content");
    router.replace(`${pathname}?tab=${id}`, { scroll: false });
  }

  const currentWorkspaceName =
    workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? "";

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        w-full md:w-56 md:shrink-0 border-r border-gray-200 bg-white flex flex-col py-4 gap-4
        ${mobileView === "nav" ? "flex" : "hidden md:flex"}
      `}>
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="px-4 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {section.label}
            </p>
            <nav className="flex flex-col gap-0.5 px-2">
              {section.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    active === id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={14} className="text-gray-300 md:hidden" />
                </button>
              ))}
            </nav>
          </div>
        ))}
      </aside>

      {/* Content */}
      <main className={`
        flex-1 overflow-hidden bg-gray-50 flex flex-col
        ${mobileView === "content" ? "" : "hidden md:flex"}
      `}>
        {/* Mobile back header */}
        <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setMobileView("nav")}
            className="p-1.5 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <activeItem.icon size={15} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-900">{activeItem.label}</span>
        </div>

        {active === "page-templates" ? (
          <div className="flex-1 overflow-hidden">
            <PageTemplatesPanel />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            {active === "profile"       && <ProfilePanel initialName={userName} email={userEmail} />}
            {active === "general"       && <GeneralPanel workspaceId={currentWorkspaceId} workspaceName={currentWorkspaceName} workspaceSlug={currentWorkspaceSlug} />}
            {active === "workspaces"    && (
              <WorkspacePanel
                currentWorkspaceId={currentWorkspaceId}
                currentWorkspaceSlug={currentWorkspaceSlug}
                workspacePlan={workspacePlan}
                userId={userId}
                workspaces={workspaces}
              />
            )}
            {active === "team"          && <TeamPanel initialMembers={teamMembers} currentUserId={userId} currentUserRole={currentUserRole} />}
            {active === "domains"       && <DomainsPanel initialDomains={domains} rendererHost={rendererHost} />}
            {active === "payment"       && <PaymentPanel stripe={stripe} paypal={paypal} rendererUrl={rendererUrl} />}
            {active === "email"         && <EmailSettings smtp={smtp} senderIdentities={senderIdentities} />}
            {active === "storage"       && <StoragePanel initial={storage} />}
            {active === "ai-assistant"  && <AiAssistantPanel />}
            {active === "license"       && <LicensePanel />}
          </div>
        )}
      </main>
    </div>
  );
}
