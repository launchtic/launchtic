"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Search, UserPlus, Loader2, ArrowLeft } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

type Tag = { id: string; name: string; color: string | null };
type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  tags: Tag[];
};
type Card = { id: string; contact: Contact };

// Search results from /api/contacts carry tags as { tag }[]; normalize to Tag[].
function normalize(raw: any): Contact {
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName ?? null,
    lastName: raw.lastName ?? null,
    company: raw.company ?? null,
    tags: (raw.tags ?? []).map((ct: any) => ct.tag),
  };
}

export default function AddContactModal({
  stageId,
  onClose,
  onAdded,
}: {
  stageId: string;
  onClose: () => void;
  onAdded: (stageId: string, card: Card) => void;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New-contact form
  const [form, setForm] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    const res = await apiFetch(`/api/contacts?search=${encodeURIComponent(q)}`);
    const json = await res.json();
    setSearching(false);
    if (json.success) setResults(json.data.items.map(normalize));
  }, []);

  useEffect(() => {
    if (mode !== "search") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(query), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, mode, runSearch]);

  async function addToStage(contact: Contact) {
    setBusyId(contact.id);
    setError("");
    const res = await apiFetch("/api/pipelines/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, contactId: contact.id }),
    });
    const json = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(json.error ?? "Failed to add contact"); return; }
    onAdded(stageId, { id: json.data.id, contact });
    onClose();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email?.trim()) { setError("Email is required"); return; }
    setCreating(true);
    setError("");
    const res = await apiFetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()))),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) { setError(json.error ?? "Failed to create contact"); return; }
    await addToStage(normalize(json.data));
  }

  const fields = [
    { key: "email", label: "Email", type: "email" },
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "phone", label: "Phone", type: "tel" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {mode === "search" ? "Add contact to stage" : "New contact"}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {mode === "search" ? (
          <div className="p-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, company…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto -mx-1 px-1">
              {searching && (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              )}
              {!searching && results.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No contacts found.</p>
              )}
              {!searching && results.map((c) => {
                const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
                return (
                  <button
                    key={c.id}
                    onClick={() => addToStage(c)}
                    disabled={busyId === c.id}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left rounded-xl hover:bg-gray-50 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-500 truncate">{c.email}</p>
                    </div>
                    {busyId === c.id
                      ? <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />
                      : <UserPlus size={14} className="text-gray-300 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

            <button
              onClick={() => { setMode("create"); setError(""); }}
              className="w-full mt-3 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            >
              <UserPlus size={14} /> Create new contact
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-5 space-y-3">
            {fields.map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {label}{key === "email" && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={type ?? "text"}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={label}
                />
              </div>
            ))}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex items-center gap-2 justify-between pt-2">
              <button type="button" onClick={() => { setMode("search"); setError(""); }} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Create & add
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
