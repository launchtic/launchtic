"use client";

// Shared sidebar for /settings/* pages. Filters tabs by permission +
// workspace plan tier. Renders as fixed-width sidebar on desktop; collapses
// into a full-width nav on mobile (controlled by parent layout).

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Globe, CreditCard, Mail, HardDrive, LayoutTemplate, Bot, Key,
  Building2, UserCircle, Settings2, ChevronRight, ChevronLeft, Users, Shield, Palette,
  DownloadCloud, Image as ImageIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isAgencyPlan, isPaidPlan } from "../../lib/plan";
import { useRole } from "../../lib/role";

type NavItemDef = {
  /** Route segment after `/settings/`. */
  segment:      string;
  label:        string;
  icon:         LucideIcon;
  /** Hidden when current plan is below Starter (i.e. Community). Used for
   *  tabs whose features unlock on any paid tier — Team, Roles, etc. */
  starterPlus?: boolean;
  /** Hidden when current plan is below Agency. Used for Agency-exclusive
   *  features — White Label, multi-Workspace, etc. */
  agencyPlus?:  boolean;
  /** Hidden when current plan is Agency or above. */
  freeOnly?:    boolean;
  /** Permission key required to see this tab. Owner bypasses. */
  requirePerm?: string;
  /**
   * Hidden for everyone except the Organization owner. Bypasses requirePerm
   * — used for identity-bound, billing-locked settings (white-label) where
   * even an admin with full perms shouldn't override the founder's choice.
   */
  ownerOnly?:   boolean;
};

const NAV_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  {
    label: "ACCOUNT",
    items: [
      { segment: "profile", label: "Profile", icon: UserCircle },
      { segment: "general", label: "General", icon: Settings2, freeOnly: true, requirePerm: "settings:general:read" },
    ],
  },
  // ORGANIZATION section = org-wide concerns (affect every workspace under
  // this Organization). All entries are OWNER-only — invited team members
  // don't see them. White Label and Workspaces are also Agency-tier gated.
  {
    label: "ORGANIZATION",
    items: [
      { segment: "white-label", label: "White Label", icon: Palette,   ownerOnly: true, agencyPlus: true },
      { segment: "storage",     label: "Storage",     icon: HardDrive, ownerOnly: true                   },
      { segment: "workspaces",  label: "Workspaces",  icon: Building2, ownerOnly: true, agencyPlus: true },
      { segment: "license",     label: "License",     icon: Key,       ownerOnly: true                   },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { segment: "team",           label: "Team",             icon: Users,        starterPlus: true, requirePerm: "members:read"                 },
      { segment: "roles",          label: "Roles",            icon: Shield,       starterPlus: true, requirePerm: "roles:read"                   },
      { segment: "domains",        label: "Custom Domains",   icon: Globe,                          requirePerm: "settings:domains:read"          },
      { segment: "payment",        label: "Payment Settings", icon: CreditCard,                     requirePerm: "settings:payment:read"          },
      { segment: "email",          label: "Email Settings",   icon: Mail,                           requirePerm: "settings:email:read"            },
      { segment: "media",          label: "Media Library",    icon: ImageIcon,                      requirePerm: "media:read"                     },
      { segment: "page-templates", label: "Page Templates",   icon: LayoutTemplate,                 requirePerm: "settings:page_templates:read"   },
      { segment: "gallery-import", label: "Template Gallery", icon: DownloadCloud,                  ownerOnly: true                               },
      { segment: "ai-assistant",   label: "AI Assistant",     icon: Bot,                            requirePerm: "settings:ai:read"               },
    ],
  },
];

export default function SettingsSidebar({
  workspaceSlug,
  workspacePlan,
  /** Mobile state lifted to parent layout so the content area can react. */
  mobileView,
  onSelect,
}: {
  workspaceSlug: string;
  workspacePlan: string;
  mobileView:    "nav" | "content";
  onSelect:      () => void;
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const { hasPermission, isOwner } = useRole();
  const isPaid   = isPaidPlan(workspacePlan);    // STARTER | AGENCY | CUSTOM
  const isAgency = isAgencyPlan(workspacePlan);  // AGENCY  | CUSTOM

  // Filter items by plan tier + permission + owner-only flag. Owner bypasses
  // every perm check via WorkspaceRoleProvider, but ownerOnly is the inverse
  // gate — visible ONLY to owner, never to admins (regardless of perms).
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.ownerOnly   && !isOwner)  return false;
      if (item.starterPlus && !isPaid)   return false;
      if (item.agencyPlus  && !isAgency) return false;
      if (item.freeOnly    &&  isAgency) return false;
      if (item.requirePerm && !hasPermission(item.requirePerm)) return false;
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  function isActive(segment: string): boolean {
    return pathname === `/${workspaceSlug}/settings/${segment}` ||
           pathname.startsWith(`/${workspaceSlug}/settings/${segment}/`);
  }

  function handleSelect(segment: string) {
    onSelect();
    router.push(`/${workspaceSlug}/settings/${segment}`);
  }

  return (
    <aside className={`
      w-full md:w-56 md:shrink-0 border-r border-gray-200 bg-white flex flex-col py-4 gap-4
      min-h-0 overflow-y-auto
      ${mobileView === "nav" ? "flex" : "hidden md:flex"}
    `}>
      {visibleSections.map((section) => (
        <div key={section.label}>
          <p className="px-4 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {section.label}
          </p>
          <nav className="flex flex-col gap-0.5 px-2">
            {section.items.map(({ segment, label, icon: Icon }) => {
              const active = isActive(segment);
              return (
                <button
                  key={segment}
                  onClick={() => handleSelect(segment)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={14} className="text-gray-300 md:hidden" />
                </button>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}

/** Mobile back-header shown above content when a tab is open. */
export function SettingsMobileHeader({
  label,
  icon: Icon,
  onBack,
}: {
  label: string;
  icon:  LucideIcon;
  onBack: () => void;
}) {
  return (
    <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
      <button
        onClick={onBack}
        className="p-1.5 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <ChevronLeft size={18} />
      </button>
      <Icon size={15} className="text-gray-500" />
      <span className="text-sm font-medium text-gray-900">{label}</span>
    </div>
  );
}

/** Wrapper for the content area that handles mobile show/hide. */
export function SettingsContent({
  mobileView,
  children,
}: {
  mobileView: "nav" | "content";
  children:   React.ReactNode;
}) {
  return (
    <main className={`
      flex-1 overflow-y-auto bg-gray-50
      ${mobileView === "content" ? "" : "hidden md:block"}
    `}>
      {children}
    </main>
  );
}
