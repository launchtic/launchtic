"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, CreditCard, Mail, HardDrive, LayoutTemplate, Bot, Key, ChevronRight, ChevronLeft } from "lucide-react";
import DomainsPanel       from "./DomainsPanel";
import PaymentPanel       from "./PaymentPanel";
import EmailSettings      from "./EmailSettings";
import StoragePanel       from "./StoragePanel";
import PageTemplatesPanel from "./PageTemplatesPanel";
import AiAssistantPanel   from "./AiAssistantPanel";
import LicensePanel       from "./LicensePanel";

type Domain = { id: string; domain: string; verified: boolean; isDefault: boolean; createdAt: string };
type StripeData  = { publishableKey: string; secretKey: string; webhookSecret: string | null; mode: string } | null;
type PaypalData  = { clientId: string; clientSecret: string; webhookId: string | null; mode: string } | null;
type SmtpData    = { provider: string; host: string; port: number; username: string; password: string; maxPerDay: number; maxPerSecond?: number; maxConcurrent?: number } | null;
type StorageData = { driver: "local" | "s3"; endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; publicUrl: string } | null;
type SenderIdentity = { id: string; name: string; email: string; isDefault: boolean };

const NAV_ITEMS = [
  { id: "domains",        icon: Globe          },
  { id: "payment",        icon: CreditCard     },
  { id: "email",          icon: Mail           },
  { id: "storage",        icon: HardDrive      },
  { id: "page-templates", icon: LayoutTemplate },
  { id: "ai-assistant",   icon: Bot            },
  { id: "license",        icon: Key            },
] as const;

type Section = typeof NAV_ITEMS[number]["id"];

export default function SettingsClient({
  domains, stripe, paypal, smtp, storage, senderIdentities, rendererUrl, rendererHost,
}: {
  domains:  Domain[];
  stripe:   StripeData;
  paypal:   PaypalData;
  smtp:     SmtpData;
  storage:  StorageData;
  senderIdentities: SenderIdentity[];
  rendererUrl:  string;
  rendererHost: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const VALID_TABS = NAV_ITEMS.map((n) => n.id);
  const tabParam = searchParams.get("tab") as Section;
  const [active, setActive] = useState<Section>(
    VALID_TABS.includes(tabParam) ? tabParam : "domains"
  );
  const [mobileView, setMobileView] = useState<"nav" | "content">("nav");
  const t = useTranslations("settings");

  const NAV = [
    { id: "domains",        label: t("nav.customDomains"),   icon: Globe          },
    { id: "payment",        label: t("nav.paymentSettings"), icon: CreditCard     },
    { id: "email",          label: "Email Settings",         icon: Mail           },
    { id: "storage",        label: t("nav.storage"),         icon: HardDrive      },
    { id: "page-templates", label: "Page Templates",         icon: LayoutTemplate },
    { id: "ai-assistant",   label: "AI Assistant",           icon: Bot            },
    { id: "license",        label: "License",                icon: Key            },
  ] as const;

  const activeNav = NAV.find((n) => n.id === active)!;

  function handleSelect(id: Section) {
    setActive(id);
    setMobileView("content");
    router.replace(`${pathname}?tab=${id}`, { scroll: false });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <aside className={`
        w-full md:w-56 md:shrink-0 border-r border-gray-200 bg-white flex flex-col py-4
        ${mobileView === "nav" ? "flex" : "hidden md:flex"}
      `}>
        <p className="px-4 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("title")}</p>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ id, label, icon: Icon }) => (
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
      </aside>

      {/* Right content */}
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
          <activeNav.icon size={15} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-900">{activeNav.label}</span>
        </div>

        {active === "page-templates" ? (
          <div className="flex-1 overflow-hidden">
            <PageTemplatesPanel />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            {active === "domains"      && <DomainsPanel initialDomains={domains} rendererHost={rendererHost} />}
            {active === "payment"      && <PaymentPanel stripe={stripe} paypal={paypal} rendererUrl={rendererUrl} />}
            {active === "email"        && <EmailSettings smtp={smtp} senderIdentities={senderIdentities} />}
            {active === "storage"      && <StoragePanel initial={storage} />}
            {active === "ai-assistant" && <AiAssistantPanel />}
            {active === "license"      && <LicensePanel />}
          </div>
        )}
      </main>
    </div>
  );
}
