"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, Trash2, Edit2, Shield, X, Check, Users, ChevronDown, ChevronRight, Search } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useRole } from "../../lib/role";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

type Role = {
  id:          string;
  name:        string;
  description: string | null;
  permissions: string[];
  memberCount: number;
  createdAt?:  string;
};

// Permission catalog with category grouping + human labels. Owner-only
// concerns (billing, workspace CRUD, storage, white-label) are gated by the
// `isOwner` flag — they don't appear here because they cannot be granted via
// a custom role.
const PERMISSION_CATEGORIES: { label: string; perms: { key: string; label: string }[] }[] = [
  {
    label: "Funnels & Pages",
    perms: [
      { key: "funnels:read",              label: "View funnels and pages" },
      { key: "funnels:write",             label: "Create and edit funnels (page content, steps, slugs)" },
      { key: "funnels:delete",            label: "Delete funnels" },
      { key: "funnels:price_plans:write", label: "Edit step price plans (main offer pricing — revenue-sensitive)" },
      { key: "funnels:bumps:write",       label: "Manage order bumps (add-on offers at checkout — revenue-sensitive)" },
    ],
  },
  {
    label: "Physical Products",
    perms: [
      { key: "products:read",   label: "View products catalog" },
      { key: "products:write",  label: "Create and edit products" },
      { key: "products:delete", label: "Delete products" },
    ],
  },
  {
    label: "Orders",
    perms: [
      { key: "orders:read",   label: "View orders" },
      { key: "orders:refund", label: "Refund orders" },
    ],
  },
  {
    label: "Subscriptions",
    perms: [
      { key: "subscriptions:read",   label: "View subscriptions" },
      { key: "subscriptions:cancel", label: "Cancel and resume subscriptions" },
    ],
  },
  {
    label: "Transactions",
    perms: [
      { key: "transactions:read", label: "View transaction history" },
    ],
  },
  {
    label: "Coupons",
    perms: [
      { key: "coupons:read",   label: "View coupons" },
      { key: "coupons:write",  label: "Create and edit coupons" },
      { key: "coupons:delete", label: "Delete coupons" },
    ],
  },
  {
    label: "Contacts",
    perms: [
      { key: "contacts:read",   label: "View contacts" },
      { key: "contacts:write",  label: "Create and edit contacts" },
      { key: "contacts:delete", label: "Delete contacts" },
      { key: "contacts:import", label: "Import contacts (bulk CSV)" },
      { key: "contacts:export", label: "Export contacts (GDPR-sensitive)" },
    ],
  },
  {
    label: "Tags",
    perms: [
      { key: "tags:read",   label: "View tags" },
      { key: "tags:write",  label: "Create and edit tags" },
      { key: "tags:delete", label: "Delete tags" },
    ],
  },
  {
    label: "Broadcasts",
    perms: [
      { key: "broadcasts:read",   label: "View broadcasts" },
      { key: "broadcasts:write",  label: "Create and edit broadcasts" },
      { key: "broadcasts:send",   label: "Send broadcasts (irreversible)" },
      { key: "broadcasts:delete", label: "Delete broadcasts" },
    ],
  },
  {
    label: "Sequences",
    perms: [
      { key: "sequences:read",   label: "View sequences" },
      { key: "sequences:write",  label: "Create and edit sequences" },
      { key: "sequences:delete", label: "Delete sequences" },
    ],
  },
  {
    label: "Email Templates",
    perms: [
      { key: "email_templates:read",   label: "View email templates" },
      { key: "email_templates:write",  label: "Create and edit email templates" },
      { key: "email_templates:delete", label: "Delete email templates" },
    ],
  },
  {
    label: "Email Logs",
    perms: [
      { key: "email_logs:read",   label: "View email send log" },
      { key: "email_logs:resend", label: "Resend failed emails, clear log" },
    ],
  },
  {
    label: "Automations",
    perms: [
      { key: "automations:read",   label: "View automations" },
      { key: "automations:write",  label: "Create and edit automations" },
      { key: "automations:delete", label: "Delete automations" },
    ],
  },
  {
    label: "Media",
    perms: [
      { key: "media:read",   label: "View media library" },
      { key: "media:upload", label: "Upload media files" },
      { key: "media:delete", label: "Delete media files" },
    ],
  },
  {
    label: "AI Features",
    perms: [
      {
        key:   "ai:use",
        label: "Use all AI features — chat assistant, template auto-fill, copy generation",
      },
    ],
  },
  {
    label: "Settings — General",
    perms: [
      { key: "settings:general:read",  label: "View workspace general settings" },
      { key: "settings:general:write", label: "Modify workspace general settings" },
    ],
  },
  {
    label: "Settings — Custom Domains",
    perms: [
      { key: "settings:domains:read",  label: "View custom domains" },
      { key: "settings:domains:write", label: "Add, verify, remove domains" },
    ],
  },
  {
    label: "Settings — Payment (Stripe/PayPal)",
    perms: [
      { key: "settings:payment:read",  label: "View payment configuration" },
      { key: "settings:payment:write", label: "Edit Stripe / PayPal credentials" },
    ],
  },
  {
    label: "Settings — Email (SMTP)",
    perms: [
      { key: "settings:email:read",  label: "View SMTP + sender identity config" },
      { key: "settings:email:write", label: "Edit SMTP credentials + sender identities" },
    ],
  },
  {
    label: "Settings — Storage",
    perms: [
      { key: "settings:storage:read",  label: "View storage configuration" },
      { key: "settings:storage:write", label: "Edit S3 credentials and bucket config" },
    ],
  },
  {
    label: "Settings — Page Templates",
    perms: [
      { key: "settings:page_templates:read",  label: "Browse workspace templates" },
      { key: "settings:page_templates:write", label: "Create, edit, delete templates" },
    ],
  },
  {
    label: "Settings — AI Assistant",
    perms: [
      { key: "settings:ai:read",  label: "View AI config + use AI Assistant" },
      { key: "settings:ai:write", label: "Edit AI provider + API key" },
    ],
  },
  {
    label: "Team",
    perms: [
      { key: "members:read",   label: "View team list" },
      { key: "members:manage", label: "Invite, remove, change team roles" },
    ],
  },
  {
    label: "Roles",
    perms: [
      { key: "roles:read",   label: "View roles list" },
      { key: "roles:manage", label: "Create, edit, delete roles" },
    ],
  },
];

export default function RolesPanel() {
  const { canManageRoles } = useRole();
  // useConfirm() returns the confirm function directly (not a {confirm} object).
  const confirm = useConfirm();
  const toast   = useToast();

  const [roles, setRoles]     = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/roles")
      .then((r) => r.json())
      .then((r) => { if (r.success) setRoles(r.data); })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(role: Role) {
    if (role.memberCount > 0) {
      toast.warning(
        `Cannot delete "${role.name}" — ${role.memberCount} member(s) still use this role. Reassign them first.`,
      );
      return;
    }
    const ok = await confirm({
      title:        `Delete role "${role.name}"?`,
      description:  "This permanently removes the role. Members assigned to it will need a new role.",
      confirmLabel: "Delete role",
      variant:      "danger",
    });
    if (!ok) return;

    const res  = await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to delete role"); return; }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    toast.success(`Role "${role.name}" deleted.`);
  }

  function handleSaved(saved: Role) {
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    setEditing(null);
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading roles…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Roles</h2>
          <p className="text-sm text-gray-500">
            Define what team members can do. Members are assigned a role when invited.
          </p>
        </div>
        {canManageRoles && (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Create role
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-start gap-2">
        <Shield size={13} className="text-blue-600 shrink-0 mt-0.5" />
        <span>The workspace owner always has full access — independent of roles. Billing and workspace deletion are owner-only.</span>
      </p>

      {/* Roles list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {roles.map((role, i) => (
          <div
            key={role.id}
            className={`flex items-start gap-3 px-5 py-4 ${i > 0 ? "border-t border-gray-100" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  <Users size={10} />
                  {role.memberCount}
                </span>
              </div>
              {role.description && (
                <p className="text-xs text-gray-500 mb-1.5">{role.description}</p>
              )}
              <p className="text-[11px] text-gray-400">
                {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
              </p>
            </div>

            {canManageRoles && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(role)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit role"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => handleDelete(role)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete role"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <RoleEditor
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function RoleEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial:  Role | null;
  onClose:  () => void;
  onSaved:  (role: Role) => void;
}) {
  const [name, setName]               = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [perms, setPerms]             = useState<Set<string>>(new Set(initial?.permissions ?? []));
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState<Set<string>>(() => {
    // Pre-expand categories that already have selections (helps when editing)
    if (!initial) return new Set();
    const initialPerms = new Set(initial.permissions);
    return new Set(
      PERMISSION_CATEGORIES
        .filter((c) => c.perms.some((p) => initialPerms.has(p.key)))
        .map((c) => c.label),
    );
  });

  const totalPerms = useMemo(
    () => PERMISSION_CATEGORIES.reduce((n, c) => n + c.perms.length, 0),
    [],
  );

  // When searching, filter perms by label or key; show categories with any match.
  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PERMISSION_CATEGORIES;
    return PERMISSION_CATEGORIES
      .map((c) => ({
        ...c,
        perms: c.perms.filter(
          (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.perms.length > 0);
  }, [search]);

  const searching = search.trim().length > 0;

  function togglePerm(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else               next.add(key);
      return next;
    });
  }

  function toggleCategory(cat: typeof PERMISSION_CATEGORIES[number]) {
    setPerms((prev) => {
      const next = new Set(prev);
      const allSelected = cat.perms.every((p) => next.has(p.key));
      if (allSelected) cat.perms.forEach((p) => next.delete(p.key));
      else             cat.perms.forEach((p) => next.add(p.key));
      return next;
    });
  }

  function toggleExpand(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else                 next.add(label);
      return next;
    });
  }

  function applyPresetReadOnly() {
    setPerms(new Set(
      PERMISSION_CATEGORIES.flatMap((c) => c.perms)
        .filter((p) => p.key.endsWith(":read"))
        .map((p) => p.key),
    ));
  }

  function applyPresetFullAccess() {
    setPerms(new Set(PERMISSION_CATEGORIES.flatMap((c) => c.perms.map((p) => p.key))));
  }

  function applyPresetClear() {
    setPerms(new Set());
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const body = {
      name:        name.trim(),
      description: description.trim() || null,
      permissions: Array.from(perms),
    };

    const url    = initial ? `/api/roles/${initial.id}` : "/api/roles";
    const method = initial ? "PATCH" : "POST";
    const res  = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save role"); return; }

    onSaved(json.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {initial ? `Edit role: ${initial.name}` : "Create role"}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              placeholder="e.g. Sales Lead"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              required
              placeholder="What this role is for"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">Permissions</label>
              <span className="text-[11px] text-gray-500 tabular-nums">
                {perms.size} / {totalPerms} selected
              </span>
            </div>

            {/* Toolbar — search + presets */}
            <div className="space-y-2 mb-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search permissions…"
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-500 mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={applyPresetReadOnly}
                  className="text-[11px] font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Read-only
                </button>
                <button
                  type="button"
                  onClick={applyPresetFullAccess}
                  className="text-[11px] font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Full access
                </button>
                <button
                  type="button"
                  onClick={applyPresetClear}
                  className="text-[11px] font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Category list — collapsible accordion */}
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {visibleCategories.length === 0 && (
                <p className="text-xs text-gray-500 px-3 py-4 text-center">
                  No permissions match "{search.trim()}"
                </p>
              )}
              {visibleCategories.map((cat) => {
                const selectedCount = cat.perms.reduce((n, p) => n + (perms.has(p.key) ? 1 : 0), 0);
                const allSelected   = selectedCount === cat.perms.length;
                const someSelected  = selectedCount > 0 && !allSelected;
                // While searching: auto-expand to show matches. Otherwise: respect user toggle.
                const isOpen = searching || expanded.has(cat.label);

                const badgeColor =
                  selectedCount === 0 ? "text-gray-400 bg-gray-100"
                  : allSelected       ? "text-blue-700 bg-blue-100"
                  :                     "text-blue-600 bg-blue-50";

                return (
                  <div key={cat.label}>
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleExpand(cat.label)}
                        disabled={searching}
                        className="flex items-center gap-1.5 flex-1 text-left disabled:cursor-default"
                      >
                        {isOpen
                          ? <ChevronDown  size={13} className="text-gray-400 shrink-0" />
                          : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
                        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                          {cat.label}
                        </span>
                        <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${badgeColor}`}>
                          {selectedCount}/{cat.perms.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors shrink-0"
                      >
                        {allSelected ? "Clear" : someSelected ? "Select rest" : "Select all"}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="px-3 pb-2.5 pl-8 space-y-1.5 bg-gray-50/40">
                        {cat.perms.map((p) => (
                          <label
                            key={p.key}
                            className="flex items-start gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900 group pt-1"
                          >
                            <input
                              type="checkbox"
                              checked={perms.has(p.key)}
                              onChange={() => togglePerm(p.key)}
                              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1">{p.label}</span>
                            <code className="text-[10px] text-gray-400 group-hover:text-gray-600 font-mono shrink-0">
                              {p.key}
                            </code>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </form>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving
              ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
              : <><Check  size={13} /> {initial ? "Save" : "Create"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
