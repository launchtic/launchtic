"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Zap, Users, Mail, GitBranch, BarChart2, Settings, LogOut, ChevronDown, Package, Menu, X, ShoppingCart, Ticket, TrendingUp, Repeat, Receipt, Tag as TagIcon, LayoutDashboard, FileText, Megaphone, Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type NavLink = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; icon: LucideIcon; children: NavLink[] };
type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
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

const navItems: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",          icon: LayoutDashboard },
  { href: "/funnels",     label: "Funnels",             icon: Zap       },
  {
    label: "Sales",
    icon: TrendingUp,
    children: [
      { href: "/physical-products", label: "Physical Products", icon: Package },
      { href: "/orders",        label: "Orders",        icon: ShoppingCart },
      { href: "/subscriptions", label: "Subscriptions", icon: Repeat       },
      { href: "/transactions",  label: "Transactions",  icon: Receipt      },
      { href: "/coupons",       label: "Coupons",       icon: Ticket       },
    ],
  },
  {
    label: "Contacts",
    icon: Users,
    children: [
      { href: "/contacts",      label: "All contacts", icon: Users   },
      { href: "/contacts/tags", label: "Tags",         icon: TagIcon },
    ],
  },
  {
    label: "Emails",
    icon: Mail,
    children: [
      { href: "/emails/broadcasts", label: "Broadcasts",  icon: Megaphone },
      { href: "/sequences",         label: "Sequences",   icon: Repeat    },
      { href: "/emails/templates",  label: "Templates",   icon: FileText  },
      { href: "/emails/logs",       label: "Email Logs",  icon: Inbox     },
    ],
  },
  { href: "/automations", label: "Automations", icon: GitBranch },
  { href: "/settings",    label: "Settings",    icon: Settings  },
];

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

function UserMenu({ name, email, initials }: { name: string; email: string; initials: string }) {
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
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopNav({
  name,
  email,
  initials,
}: {
  name: string;
  email: string;
  initials: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4 shrink-0 relative z-30">
        {/* Logo */}
        <Link href="/dashboard" className="shrink-0 mr-2 flex items-center">
          <img src="/logo.svg" alt="launchtic" className="h-7 w-auto" />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
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
          <UserMenu name={name} email={email} initials={initials} />
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
