"use client";

import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";

type Field = { key: string; label: string; type?: string; required?: boolean };

const FIELDS: Field[] = [
  { key: "email",     label: "Email",      type: "email", required: true },
  { key: "firstName", label: "First name" },
  { key: "lastName",  label: "Last name"  },
  { key: "phone",     label: "Phone",      type: "tel"   },
  { key: "country",   label: "Country"    },
];

export default function CreateContactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setForm({});
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email?.trim()) { setError("Email is required"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()))
      ),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to create contact"); return; }
    reset();
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">New Contact</h2>
          <button onClick={() => { reset(); onClose(); }} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {FIELDS.map(({ key, label, type, required }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
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

          <div className="flex items-center gap-2 justify-end pt-2">
            <button type="button" onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Create contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
