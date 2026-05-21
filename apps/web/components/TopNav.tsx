"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Zap, Users, Mail, GitBranch, BarChart2, Settings, LogOut, ChevronDown, Package, Menu, X, ShoppingCart, Ticket, TrendingUp, Repeat, Receipt, Tag as TagIcon, LayoutDashboard, FileText, Megaphone, Inbox, Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { isAgencyPlan } from "../lib/plan";
import { useRole } from "../lib/role";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

type WorkspaceListItem = { id: string; name: string; slug: string };

/**
 * `requirePerm` — permission key required to see this link. If undefined,
 * always visible. Owner bypasses every permission check so they see all.
 * Groups (with children) are hidden if every child is filtered out.
 */
type NavLink = { href: string; label: string; icon: LucideIcon; requirePerm?: string };
type NavGroup = { label: string; icon: LucideIcon; children: NavLink[] };
type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

/**
 * Filter nav items by viewer's permissions. Drops links the viewer can't
 * read and collapses empty groups. Called per-render — cheap because the
 * NAV_ITEMS list is short.
 */
function filterNavItems(items: NavItem[], hasPermission: (p: string) => boolean): NavItem[] {
  return items
    .map((item) => {
      if (isGroup(item)) {
        const visibleChildren = item.children.filter(
          (c) => !c.requirePerm || hasPermission(c.requirePerm),
        );
        if (visibleChildren.length === 0) return null;
        return { ...item, children: visibleChildren };
      }
      if (item.requirePerm && !hasPermission(item.requirePerm)) return null;
      return item;
    })
    .filter((item): item is NavItem => item !== null);
}

function activeChildHref(children: NavLink[], pathname: string): string | null {
  let best: NavLink | null = null;
  for (const c of children) {
    if (pathname === c.href || pathname.startsWith(c.href + "/")) {
      if (!best || c.href.length > best.href.length) best = c;
    }
  }
  return best?.href ?? null;
}

// Bare paths — prefixed with /{workspaceSlug} at render time.
// `requirePerm` gates visibility — Owner bypasses all checks (sees everything).
// Settings has no requirePerm because its sub-tabs filter individually (Profile
// is always available even to Viewer).
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",          icon: LayoutDashboard, requirePerm: "dashboard:read" },
  { href: "/funnels",     label: "Funnels",            icon: Zap,             requirePerm: "funnels:read"   },
  {
    label: "Sales",
    icon: TrendingUp,
    children: [
      { href: "/physical-products", label: "Physical Products", icon: Package,      requirePerm: "products:read"      },
      { href: "/orders",            label: "Orders",            icon: ShoppingCart, requirePerm: "orders:read"        },
      { href: "/subscriptions",     label: "Subscriptions",     icon: Repeat,       requirePerm: "subscriptions:read" },
      { href: "/transactions",      label: "Transactions",      icon: Receipt,      requirePerm: "transactions:read"  },
      { href: "/coupons",           label: "Coupons",           icon: Ticket,       requirePerm: "coupons:read"       },
    ],
  },
  {
    label: "Contacts",
    icon: Users,
    children: [
      { href: "/contacts",      label: "All contacts", icon: Users,   requirePerm: "contacts:read" },
      { href: "/contacts/tags", label: "Tags",         icon: TagIcon, requirePerm: "tags:read"     },
    ],
  },
  {
    label: "Emails",
    icon: Mail,
    children: [
      { href: "/emails/broadcasts", label: "Broadcasts",  icon: Megaphone, requirePerm: "broadcasts:read"      },
      { href: "/sequences",         label: "Sequences",   icon: Repeat,    requirePerm: "sequences:read"       },
      { href: "/emails/templates",  label: "Templates",   icon: FileText,  requirePerm: "email_templates:read" },
      { href: "/emails/logs",       label: "Email Logs",  icon: Inbox,     requirePerm: "email_logs:read"      },
    ],
  },
  { href: "/automations", label: "Automations", icon: GitBranch, requirePerm: "automations:read" },
  { href: "/settings",    label: "Settings",    icon: Settings                                   },
];

function prefixItems(items: NavItem[], slug: string): NavItem[] {
  return items.map((item) => {
    if (isGroup(item)) {
      return { ...item, children: item.children.map((c) => ({ ...c, href: `/${slug}${c.href}` })) };
    }
    return { ...item, href: `/${slug}${item.href}` };
  });
}

function NavDropdown({ item, pathname }: { item: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeHref = activeChildHref(item.children, pathname);
  const active = activeHref !== null;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
          active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <item.icon size={15} strokeWidth={active ? 2 : 1.75} />
        {item.label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          {item.children.map(({ href, label, icon: Icon }) => {
            const childActive = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  childActive ? "text-blue-700 font-medium bg-blue-50" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon size={14} strokeWidth={childActive ? 2 : 1.75} />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({
  name, email, initials, workspaceSlug, workspaceName, workspacePlan,
}: {
  name: string; email: string; initials: string;
  workspaceSlug: string; workspaceName: string; workspacePlan: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
          {initials}
        </div>
        <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate hidden sm:block">{name}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          {/* User info */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>


          {/* Sign out */}
          <div className="py-1">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopNav({
  name,
  email,
  initials,
  workspaceSlug,
  workspaceName,
  workspacePlan,
  workspaces,
}: {
  name: string;
  email: string;
  initials: string;
  workspaceSlug: string;
  workspaceName: string;
  workspaces: WorkspaceListItem[];
  workspacePlan: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasPermission } = useRole();
  // Filter by permission BEFORE prefixing — drops links the viewer can't
  // access. Owner bypasses → sees all items. Members only see what they
  // have :read permission for. Empty groups are collapsed entirely.
  const navItems = prefixItems(filterNavItems(NAV_ITEMS, hasPermission), workspaceSlug);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4 shrink-0 relative z-30">
        {/* Logo */}
        <Link href={`/${workspaceSlug}/dashboard`} className="shrink-0 flex items-center">
          <img src="/logo.svg" alt="launchtic" className="h-7 w-auto" />
        </Link>

        {/* Workspace switcher — Agency-tier only feature. Below Agency the
            operator has at most one workspace, so the switcher would be pure
            chrome with no value. Hidden under lg breakpoint anyway to keep
            nav room on smaller screens. */}
        {isAgencyPlan(workspacePlan) && (
          <div className="shrink-0 hidden lg:block">
            <WorkspaceSwitcher
              currentSlug={workspaceSlug}
              currentName={workspaceName}
              workspaces={workspaces}
              canSwitch={workspaces.length > 1}
            />
          </div>
        )}

        {/* Desktop nav links — min-w-0 so it can shrink before clipping the
            user menu / switcher on tight viewports. NOTE: do NOT use
            `overflow-hidden` here — it clips absolutely-positioned dropdowns
            (Sales / Contacts / Emails submenus rendered via NavDropdown).
            Use `overflow-x-clip` instead: clips horizontally without forcing
            the Y axis to auto, so vertical dropdowns escape the nav box. */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0 overflow-x-clip">
          {navItems.map((item) => {
            if (isGroup(item)) {
              return <NavDropdown key={item.label} item={item} pathname={pathname} />;
            }
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                  active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <item.icon size={15} strokeWidth={active ? 2 : 1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <UserMenu
            name={name}
            email={email}
            initials={initials}
            workspaceSlug={workspaceSlug}
            workspaceName={workspaceName}
            workspacePlan={workspacePlan}
          />
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/20"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute top-14 left-0 right-0 bg-white border-b border-gray-200 shadow-lg px-4 py-3 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Workspace section — Agency-tier only (matches desktop). Below
                Agency there's only one workspace, so the section is hidden. */}
            {isAgencyPlan(workspacePlan) && (
              <MobileWorkspaceSection
                currentSlug={workspaceSlug}
                currentName={workspaceName}
                workspaces={workspaces}
                canSwitch={workspaces.length > 1}
              />
            )}

            {navItems.map((item) => {
              if (isGroup(item)) {
                const activeHref = activeChildHref(item.children, pathname);
                const groupActive = activeHref !== null;
                return (
                  <div key={item.label}>
                    <div className={`flex items-center gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider ${groupActive ? "text-blue-600" : "text-gray-400"}`}>
                      <item.icon size={14} />
                      {item.label}
                    </div>
                    {item.children.map(({ href, label, icon: Icon }) => {
                      const active = href === activeHref;
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={`flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl text-sm transition-colors ${
                            active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                        >
                          <Icon size={15} strokeWidth={active ? 2 : 1.75} />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                    active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <item.icon size={16} strokeWidth={active ? 2 : 1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// Mobile-only workspace section shown at the top of the hamburger menu.
// Static identity for single-workspace / non-Agency; expandable switcher for
// Agency+ with multiple workspaces. Navigation is plain Link — workspace
// context propagates via URL on the next page load.
function MobileWorkspaceSection({
  currentSlug,
  currentName,
  workspaces,
  canSwitch,
}: {
  currentSlug: string;
  currentName: string;
  workspaces: WorkspaceListItem[];
  canSwitch: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Static badge for non-switching case — just shows current workspace.
  if (!canSwitch) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 mb-1 rounded-xl bg-gray-50 text-sm text-gray-700">
        <Building2 size={14} className="text-gray-400 shrink-0" />
        <span className="truncate font-medium">{currentName}</span>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Building2 size={14} className="text-gray-400 shrink-0" />
        <span className="truncate font-medium flex-1 text-left">{currentName}</span>
        <ChevronDown size={13} className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-1 pl-2 flex flex-col gap-0.5">
          {workspaces.map((ws) => {
            const active = ws.slug === currentSlug;
            return (
              <Link
                key={ws.id}
                href={`/${ws.slug}/dashboard`}
                className={`flex items-center justify-between px-4 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="truncate">{ws.name}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 ml-2" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
