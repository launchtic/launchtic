"use client";

// Shared sidebar for /settings/* pages. Filters tabs by permission +
// workspace plan tier. Renders as fixed-width sidebar on desktop; collapses
// into a full-width nav on mobile (controlled by parent layout).

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Globe, CreditCard, Mail, HardDrive, LayoutTemplate, Bot, Key,
  Building2, UserCircle, Settings2, ChevronRight, ChevronLeft, ChevronDown, Users, Shield, Palette, Plug,
  Image as ImageIcon, Upload, Mails,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isAgencyPlan } from "@launchtic/database";
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

// A group is a collapsible parent (no page of its own); its children keep
// their own routes. A group left with one visible child renders that child
// as a top-level item.
type NavGroupDef = { label: string; icon: LucideIcon; items: NavItemDef[] };
type NavEntry = NavItemDef | NavGroupDef;
const isGroup = (e: NavEntry): e is NavGroupDef => "items" in e;

const NAV_SECTIONS: { label: string; entries: NavEntry[] }[] = [
  {
    label: "ACCOUNT",
    entries: [
      { segment: "profile", label: "Profile", icon: UserCircle },
    ],
  },
  // ORGANIZATION section = org-wide concerns (affect every workspace under
  // this Organization). All entries are OWNER-only — invited team members
  // don't see them. White Label and Workspaces are also Agency-tier gated.
  {
    label: "ORGANIZATION",
    entries: [
      { segment: "license",     label: "License & Updates", icon: Key, ownerOnly: true                   },
      { segment: "white-label", label: "White Label", icon: Palette,   ownerOnly: true, agencyPlus: true },
      { segment: "storage",     label: "Storage",     icon: HardDrive, ownerOnly: true                   },
      { segment: "workspaces",  label: "Workspaces",  icon: Building2, ownerOnly: true, agencyPlus: true },
    ],
  },
  {
    label: "WORKSPACE",
    entries: [
      { segment: "general", label: "General",        icon: Settings2, requirePerm: "settings:general:read" },
      { segment: "domains", label: "Custom Domains", icon: Globe,     requirePerm: "settings:domains:read" },
      {
        label: "Team & Roles", icon: Users,
        items: [
          { segment: "team",  label: "Team",  icon: Users,  starterPlus: true, requirePerm: "members:read" },
          { segment: "roles", label: "Roles", icon: Shield, starterPlus: true, requirePerm: "roles:read"   },
        ],
      },
      {
        label: "Integrations", icon: Plug,
        items: [
          { segment: "payment", label: "Payment Settings", icon: CreditCard, requirePerm: "settings:payment:read" },
          { segment: "email",   label: "Email Settings",   icon: Mail,       requirePerm: "settings:email:read"   },
          { segment: "ai",      label: "AI",               icon: Bot,        requirePerm: "settings:ai:read"      },
        ],
      },
      {
        label: "Content", icon: LayoutTemplate,
        items: [
          { segment: "page-templates",  label: "Page Templates",  icon: LayoutTemplate, requirePerm: "settings:page_templates:read" },
          { segment: "email-templates", label: "Email Templates", icon: Mails,          requirePerm: "email_templates:read"         },
          { segment: "media",           label: "Media Library",   icon: ImageIcon,      requirePerm: "media:read"                   },
        ],
      },
      { segment: "import", label: "Import", icon: Upload, ownerOnly: true },
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
  workspacePlan: string | null;
  mobileView:    "nav" | "content";
  onSelect:      () => void;
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const { hasPermission, isOwner } = useRole();
  const isAgency = isAgencyPlan(workspacePlan);  // AGENCY | CUSTOM

  // Filter items by plan tier + permission + owner-only flag. Owner bypasses
  // every perm check via WorkspaceRoleProvider, but ownerOnly is the inverse
  // gate — visible ONLY to owner, never to admins (regardless of perms).
  const visible = (item: NavItemDef) => {
    if (item.ownerOnly   && !isOwner)  return false;
    if (item.starterPlus && !isAgency) return false;
    if (item.agencyPlus  && !isAgency) return false;
    if (item.freeOnly    &&  isAgency) return false;
    if (item.requirePerm && !hasPermission(item.requirePerm)) return false;
    return true;
  };

  // Filter by plan tier + permission + owner-only; collapse 1-child groups.
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.flatMap((e): NavEntry[] => {
      if (!isGroup(e)) return visible(e) ? [e] : [];
      const items = e.items.filter(visible);
      if (items.length === 0) return [];
      if (items.length === 1) return items;
      return [{ ...e, items }];
    }),
  })).filter((s) => s.entries.length > 0);

  function isActive(segment: string): boolean {
    return pathname === `/${workspaceSlug}/settings/${segment}` ||
           pathname.startsWith(`/${workspaceSlug}/settings/${segment}/`);
  }

  // The group holding the current page is always open; others toggle.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const isOpen = (g: NavGroupDef) => open.has(g.label) || g.items.some((i) => isActive(i.segment));
  function toggle(g: NavGroupDef) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (isOpen(g)) next.delete(g.label); else next.add(g.label);
      return next;
    });
  }

  function handleSelect(segment: string) {
    onSelect();
    router.push(`/${workspaceSlug}/settings/${segment}`);
  }

  const renderItem = ({ segment, label, icon: Icon }: NavItemDef, child = false) => {
    const active = isActive(segment);
    return (
      <button
        key={segment}
        onClick={() => handleSelect(segment)}
        className={`flex items-center gap-2.5 rounded-xl font-medium transition-colors text-left ${
          child ? "pl-9 pr-3 py-2 text-[13px]" : "px-3 py-2.5 text-sm"
        } ${
          active
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        {!child && <Icon size={15} className="shrink-0" />}
        <span className="flex-1">{label}</span>
        <ChevronRight size={14} className="text-gray-300 md:hidden" />
      </button>
    );
  };

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
            {section.entries.map((e) => {
              if (!isGroup(e)) return renderItem(e);
              const expanded = isOpen(e);
              const holdsActive = e.items.some((i) => isActive(i.segment));
              const Icon = e.icon;
              return (
                <div key={e.label} className="flex flex-col gap-0.5">
                  <button
                    onClick={() => toggle(e)}
                    aria-expanded={expanded}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left hover:bg-gray-100 ${
                      holdsActive ? "text-blue-700" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="flex-1">{e.label}</span>
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                  </button>
                  {expanded && e.items.map((i) => renderItem(i, true))}
                </div>
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
