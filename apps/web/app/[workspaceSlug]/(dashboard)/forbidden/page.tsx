// 403 Forbidden page for the dashboard layout. Reached when a workspace
// member tries to access a page they lack permission for — `requireWorkspaceFromSlug`
// redirects here with `?perm=<permission>` so we can tell the user exactly
// what's missing.
//
// Lives under (dashboard) so TopNav + sidebar are preserved — the user can
// still click another menu item without re-logging-in or going back.
//
// Not-a-member (404) is handled separately by notFound() in the helper —
// those users shouldn't even see the workspace exists.

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

type Props = {
  params:       Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ perm?: string }>;
};

// Human-friendly labels for permission keys. Keep in sync with seed-roles.ts
// + RolesPanel categories. Falls back to the raw key when missing.
const PERMISSION_LABELS: Record<string, string> = {
  "ai:use":                           "use AI features (chat, auto-fill, generation)",
  "funnels:read":                     "view funnels",
  "funnels:write":                    "create or edit funnels",
  "funnels:delete":                   "delete funnels",
  "products:read":                    "view physical products",
  "products:write":                   "create or edit products",
  "products:delete":                  "delete products",
  "orders:read":                      "view orders",
  "orders:refund":                    "refund orders",
  "subscriptions:read":               "view subscriptions",
  "subscriptions:cancel":             "cancel or resume subscriptions",
  "transactions:read":                "view transactions",
  "coupons:read":                     "view coupons",
  "coupons:write":                    "create or edit coupons",
  "coupons:delete":                   "delete coupons",
  "contacts:read":                    "view contacts",
  "contacts:write":                   "create or edit contacts",
  "contacts:delete":                  "delete contacts",
  "contacts:import":                  "import contacts",
  "contacts:export":                  "export contacts",
  "tags:read":                        "view tags",
  "tags:write":                       "create or edit tags",
  "tags:delete":                      "delete tags",
  "broadcasts:read":                  "view broadcasts",
  "broadcasts:write":                 "create or edit broadcasts",
  "broadcasts:send":                  "send broadcasts",
  "broadcasts:delete":                "delete broadcasts",
  "sequences:read":                   "view sequences",
  "sequences:write":                  "create or edit sequences",
  "sequences:delete":                 "delete sequences",
  "email_templates:read":             "view email templates",
  "email_templates:write":            "create or edit email templates",
  "email_templates:delete":           "delete email templates",
  "email_logs:read":                  "view email logs",
  "email_logs:resend":                "resend failed emails",
  "automations:read":                 "view automations",
  "automations:write":                "create or edit automations",
  "automations:delete":               "delete automations",
  "media:read":                       "view media library",
  "media:upload":                     "upload media",
  "media:delete":                     "delete media",
  "settings:general:read":            "view general settings",
  "settings:general:write":           "modify general settings",
  "settings:domains:read":            "view custom domains",
  "settings:domains:write":           "manage custom domains",
  "settings:payment:read":            "view payment configuration",
  "settings:payment:write":           "modify payment configuration",
  "settings:email:read":              "view email / SMTP configuration",
  "settings:email:write":             "modify email / SMTP configuration",
  "settings:storage:read":            "view storage configuration",
  "settings:storage:write":           "modify storage configuration",
  "settings:page_templates:read":     "browse page templates",
  "settings:page_templates:write":    "manage page templates",
  "settings:ai:read":                 "view AI configuration",
  "settings:ai:write":                "modify AI configuration",
  "members:read":                     "view team members",
  "members:manage":                   "invite or remove team members",
  "roles:read":                       "view roles",
  "roles:manage":                     "manage roles",
};

export const metadata = { title: "Access denied" };

export default async function ForbiddenPage({ params, searchParams }: Props) {
  const { workspaceSlug } = await params;
  const { perm }          = await searchParams;

  const action = perm ? PERMISSION_LABELS[perm] : null;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-16 bg-gray-50">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert size={26} className="text-amber-600" strokeWidth={1.75} />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>

        {action ? (
          <p className="text-sm text-gray-600 leading-relaxed mb-1">
            Your role doesn&apos;t have permission to{" "}
            <span className="font-medium text-gray-900">{action}</span>.
          </p>
        ) : (
          <p className="text-sm text-gray-600 leading-relaxed mb-1">
            Your role doesn&apos;t have permission to access this page.
          </p>
        )}

        <p className="text-xs text-gray-400 mb-6">
          Ask the workspace owner to update your role or grant you the necessary permissions.
        </p>

        {perm && (
          <div className="mb-6 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
              Missing permission
            </p>
            <code className="text-xs font-mono text-gray-700">{perm}</code>
          </div>
        )}

        <Link
          href={`/${workspaceSlug}/dashboard`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
