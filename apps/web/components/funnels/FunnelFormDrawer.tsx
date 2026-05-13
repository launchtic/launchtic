"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Users, ShoppingCart, Wrench, Loader2, Plus, Trash2, Lock, AlertTriangle } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@launchtic/types";
import FormDrawer from "../ui/FormDrawer";

const CURRENCIES = SUPPORTED_CURRENCIES;

type GoalId = "audience" | "sell" | "custom";

const GOAL_STEPS: Record<GoalId, { name: string; slugSuffix: string; type: string }[]> = {
  audience: [
    { name: "Opt-in Page",  slugSuffix: "optin",    type: "OPTIN"    },
    { name: "Thank You",    slugSuffix: "thankyou",  type: "THANKYOU" },
  ],
  sell: [
    { name: "Sales Page",   slugSuffix: "sales",     type: "SALES"    },
    { name: "Order Form",   slugSuffix: "checkout",  type: "CHECKOUT" },
    { name: "Thank You",    slugSuffix: "thankyou",  type: "THANKYOU" },
  ],
  custom: [],
};

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "funnel";
}

type Domain = { id: string; domain: string; verified: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  editId?: string;
  onSuccess?: (funnelId: string) => void;
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400";

function FaviconUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd }).then((r) => r.json());
      const url = res.data?.url ?? res.url;
      if (url) onChange(url);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="relative w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors overflow-hidden shrink-0 group">
        <input type="file" accept="image/*,.ico" className="sr-only" onChange={handleFile} disabled={uploading} />
        {value ? (
          <img src={value} alt="" className="w-full h-full object-contain p-1" />
        ) : uploading ? (
          <Loader2 size={16} className="text-blue-400 animate-spin" />
        ) : (
          <Plus size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
        )}
      </label>
      <div className="flex-1 min-w-0">
        {value ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 truncate">{value}</p>
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Click to upload (.ico, .png, .svg)</p>
        )}
      </div>
    </div>
  );
}

export default function FunnelFormDrawer({ open, onClose, mode, editId, onSuccess }: Props) {
  const params = useParams();
  const slug = params.workspaceSlug as string;
  const isEdit = mode === "edit";

  const GOALS = [
    { id: "audience" as GoalId, label: "Build an Audience", description: "Collect leads and grow your list", icon: <Users size={22} className="text-violet-500" /> },
    { id: "sell"     as GoalId, label: "Sell a Product",    description: "Sell physical or digital products",  icon: <ShoppingCart size={22} className="text-blue-500" /> },
    { id: "custom"   as GoalId, label: "Custom",            description: "Start with a blank funnel",          icon: <Wrench size={22} className="text-gray-500" /> },
  ];

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<GoalId>("audience");
  const [currency, setCurrency] = useState("usd");
  const [currencyLocked, setCurrencyLocked] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [assignedDomainId, setAssignedDomainId] = useState("");
  const [initialAssignedIds, setInitialAssignedIds] = useState<string[]>([]);
  const [favicon, setFavicon] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setGoal("audience");
    setCurrency("usd");
    setCurrencyLocked(false);
    setAssignedDomainId("");
    setInitialAssignedIds([]);
    setFavicon("");

    if (!isEdit) return;

    if (!editId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/funnels/${editId}`).then((r) => r.json()),
      fetch(`/api/domains`).then((r) => r.json()),
      fetch(`/api/funnel-domains?funnelId=${editId}`).then((r) => r.json()),
    ])
      .then(([funnelRes, domainsRes, funnelDomainsRes]) => {
        const funnel = funnelRes?.data ?? funnelRes;
        if (!funnel?.id) throw new Error(funnel?.error ?? "Failed to load funnel");
        setName(funnel.name ?? "");
        setCurrency(funnel.currency ?? "usd");
        setCurrencyLocked(!!funnel.currencyLocked);
        setFavicon(funnel.favicon ?? "");
        const domainList: Domain[] = Array.isArray(domainsRes) ? domainsRes : [];
        setDomains(domainList);
        const assigned: Domain[] = Array.isArray(funnelDomainsRes) ? funnelDomainsRes : [];
        const ids = assigned.map((d) => d.id);
        setInitialAssignedIds(ids);
        setAssignedDomainId(ids[0] ?? "");
      })
      .catch((err) => setError(err.message ?? "Failed to load funnel"))
      .finally(() => setLoading(false));
  }, [open, isEdit, editId]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }

    setSubmitting(true);
    setError(null);

    try {
      if (!isEdit) {
        const res = await fetch("/api/funnels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, currency }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to create funnel"); return; }

        const funnelId: string = json.data.id;
        const baseSlug = slugify(trimmed);

        // Suggest a base slug per step (e.g. "my-funnel-optin"). Server will
        // append -2/-3 if it collides with another funnel on the same URL space.
        const stepErrors: string[] = [];
        for (const step of GOAL_STEPS[goal]) {
          const stepRes = await fetch(`/api/funnels/${funnelId}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: step.name,
              slug: `${baseSlug}-${step.slugSuffix}`,
              type: step.type,
            }),
          });
          if (!stepRes.ok) {
            const j = await stepRes.json().catch(() => ({}));
            stepErrors.push(`${step.name}: ${j.error ?? "failed"}`);
          }
        }
        // Funnel itself was created. Navigate to editor regardless so the user
        // can add/fix any missing step manually. Console log for diagnostics.
        if (stepErrors.length > 0) {
          console.warn("[funnel create] step errors:", stepErrors);
        }

        onSuccess?.(funnelId);
        return;
      }

      if (!editId) return;

      const patchRes = await fetch(`/api/funnels/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, currency, favicon: favicon.trim() || null }),
      });
      if (!patchRes.ok) {
        const json = await patchRes.json();
        setError(json.error ?? "Failed to update funnel");
        return;
      }

      const currentAssigned = initialAssignedIds[0] ?? "";
      if (assignedDomainId !== currentAssigned) {
        for (const id of initialAssignedIds) {
          const delRes = await fetch("/api/funnel-domains", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ funnelId: editId, domainId: id }),
          });
          if (!delRes.ok) {
            const j = await delRes.json().catch(() => ({}));
            setError(j.error ?? "Failed to update funnel");
            return;
          }
        }
        if (assignedDomainId) {
          const postRes = await fetch("/api/funnel-domains", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ funnelId: editId, domainId: assignedDomainId }),
          });
          if (!postRes.ok) {
            const j = await postRes.json().catch(() => ({}));
            // Slug-conflict 409 from assertAllStepSlugsAvailable — surface
            // verbatim so user sees which slug + funnel collides.
            setError(j.error ?? "Failed to update funnel");
            return;
          }
        }
      }

      onSuccess?.(editId);
    } finally {
      setSubmitting(false);
    }
  }

  const verifiedDomains = domains.filter((d) => d.verified);
  const hasNoVerified = domains.length > 0 && verifiedDomains.length === 0;

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Funnel" : "Create Funnel"}
      description={isEdit ? "Update your funnel settings" : undefined}
      width={isEdit ? "md" : "lg"}
      submitLabel={isEdit ? "Save Changes" : "Create Funnel"}
      submitting={submitting}
      submitDisabled={loading || !name.trim()}
      onSubmit={handleSubmit}
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My funnel"
              className={inputCls}
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Goal</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGoal(g.id)}
                    className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-colors ${
                      goal === g.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      goal === g.id ? "bg-white shadow-sm" : "bg-gray-100"
                    }`}>
                      {g.icon}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold leading-tight ${goal === g.id ? "text-blue-700" : "text-gray-800"}`}>
                        {g.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{g.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              {goal !== "custom" && (
                <p className="text-xs text-gray-400 mt-2">
                  Will create:{" "}
                  <span className="text-gray-600 font-medium">
                    {GOAL_STEPS[goal].map((s) => s.name).join(" → ")}
                  </span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-1.5 ${currencyLocked ? "text-gray-400" : "text-gray-700"}`}>
              Currency
            </label>
            <p className="text-xs text-gray-400 mb-2">Used for all offers in this funnel. Cannot be changed once orders exist.</p>
            <div className="relative">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${inputCls} ${
                  currencyLocked
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                    : ""
                }`}
                disabled={currencyLocked}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              {currencyLocked && (
                <Lock size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              )}
            </div>
            {currencyLocked && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} className="shrink-0" />
                Clear existing offers to update currency
              </p>
            )}
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domain</label>
              <p className="text-xs text-gray-400 mb-2">
                Assign a custom domain to this funnel.{" "}
                <a href={`/${slug}/settings`} className="text-blue-600 hover:underline">Manage domains</a>
              </p>
              <select
                value={assignedDomainId}
                onChange={(e) => setAssignedDomainId(e.target.value)}
                className={inputCls}
              >
                <option value="">No domain</option>
                {verifiedDomains.map((d) => (
                  <option key={d.id} value={d.id}>{d.domain}</option>
                ))}
              </select>
              {hasNoVerified && (
                <p className="text-xs text-amber-600 mt-1.5">No verified domains yet. Verify a domain in Settings first.</p>
              )}
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Favicon</label>
              <p className="text-xs text-gray-400 mb-2">
                Shown in browser tabs for all pages in this funnel.
              </p>
              <FaviconUpload value={favicon} onChange={setFavicon} />
            </div>
          )}
        </div>
      )}
    </FormDrawer>
  );
}
