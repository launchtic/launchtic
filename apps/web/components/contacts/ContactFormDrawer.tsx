"use client";

import { useState, useEffect } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import FormDrawer from "../ui/FormDrawer";

type Tag = { id: string; name: string; color: string | null };
type CustomField = { key: string; value: string };

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Australia","Austria","Belgium","Brazil","Canada",
  "Chile","China","Colombia","Croatia","Czech Republic","Denmark","Egypt","Finland","France",
  "Germany","Greece","Hong Kong","Hungary","India","Indonesia","Iran","Iraq","Ireland","Israel",
  "Italy","Japan","Jordan","Kenya","Malaysia","Mexico","Morocco","Netherlands","New Zealand",
  "Nigeria","Norway","Pakistan","Peru","Philippines","Poland","Portugal","Romania","Russia",
  "Saudi Arabia","Singapore","South Africa","South Korea","Spain","Sweden","Switzerland",
  "Taiwan","Thailand","Turkey","Ukraine","United Arab Emirates","United Kingdom","United States",
  "Vietnam","Other",
];

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "vi", label: "Vietnamese" },
  { code: "fr", label: "French" },  { code: "de", label: "German" },
  { code: "es", label: "Spanish" }, { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" }, { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
];

const EMPTY_FORM = {
  email: "", firstName: "", lastName: "",
  streetAddress: "", streetNumber: "", neighborhood: "",
  postalCode: "", city: "", state: "", country: "",
  phone: "", company: "", taxNumber: "", language: "en",
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (contactId: string) => void;
  allTags: Tag[];
  editContactId?: string;
};

export default function ContactFormDrawer({ open, onClose, onSuccess, allTags, editContactId }: Props) {
  const isEdit = !!editContactId;
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [initialTagIds, setInitialTagIds] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setSelectedTagIds(new Set());
    setInitialTagIds(new Set());
    setCustomFields([]);
    setTagSearch("");
    setError("");

    if (isEdit && editContactId) {
      setLoading(true);
      fetch(`/api/contacts/${editContactId}`)
        .then((r) => r.json())
        .then((json) => {
          if (!json.success) throw new Error(json.error);
          const c = json.data;
          setForm({
            email: c.email ?? "",
            firstName: c.firstName ?? "",
            lastName: c.lastName ?? "",
            streetAddress: c.streetAddress ?? "",
            streetNumber: c.streetNumber ?? "",
            neighborhood: c.neighborhood ?? "",
            postalCode: c.postalCode ?? "",
            city: c.city ?? "",
            state: c.state ?? "",
            country: c.country ?? "",
            phone: c.phone ?? "",
            company: c.company ?? "",
            taxNumber: c.taxNumber ?? "",
            language: c.language ?? "en",
          });
          const tagIds = new Set<string>((c.tags ?? []).map((t: any) => t.tag.id));
          setSelectedTagIds(tagIds);
          setInitialTagIds(tagIds);
          const cf: CustomField[] = c.customFields
            ? Object.entries(c.customFields as Record<string, string>).map(([key, value]) => ({ key, value }))
            : [];
          setCustomFields(cf);
        })
        .catch((err) => setError(err.message ?? "Failed to load contact"))
        .finally(() => setLoading(false));
    }
  }, [open, isEdit, editContactId]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!isEdit && !form.email.trim()) { setError("Email is required"); return; }
    setSubmitting(true);
    setError("");

    const extraCustomFields: Record<string, string> = {};
    for (const { key, value } of customFields) {
      if (key.trim() && value.trim()) extraCustomFields[key.trim()] = value.trim();
    }

    const base: Record<string, string | undefined | Record<string, string>> = {
      firstName:     form.firstName.trim()     || undefined,
      lastName:      form.lastName.trim()      || undefined,
      phone:         form.phone.trim()         || undefined,
      country:       form.country              || undefined,
      streetAddress: form.streetAddress.trim() || undefined,
      streetNumber:  form.streetNumber.trim()  || undefined,
      neighborhood:  form.neighborhood.trim()  || undefined,
      postalCode:    form.postalCode.trim()    || undefined,
      city:          form.city.trim()          || undefined,
      state:         form.state.trim()         || undefined,
      company:       form.company.trim()       || undefined,
      taxNumber:     form.taxNumber.trim()     || undefined,
      language:      form.language             || undefined,
    };
    if (Object.keys(extraCustomFields).length) base.customFields = extraCustomFields;

    // Create also requires email; PATCH doesn't accept it
    const payload = isEdit ? base : { email: form.email.trim(), ...base };

    const url = isEdit && editContactId ? `/api/contacts/${editContactId}` : "/api/contacts";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to save contact"); setSubmitting(false); return; }

    const contactId = isEdit && editContactId ? editContactId : json.data.id;

    if (isEdit) {
      const toAdd = [...selectedTagIds].filter((id) => !initialTagIds.has(id));
      const toRemove = [...initialTagIds].filter((id) => !selectedTagIds.has(id));
      await Promise.all([
        ...toAdd.map((tagId) =>
          fetch(`/api/contacts/${contactId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        ),
        ...toRemove.map((tagId) =>
          fetch(`/api/contacts/${contactId}/tags`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        ),
      ]);
    } else if (selectedTagIds.size > 0) {
      await Promise.all(
        [...selectedTagIds].map((tagId) =>
          fetch(`/api/contacts/${contactId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        )
      );
    }

    setSubmitting(false);
    onSuccess(contactId);
  }

  const filteredTags = allTags.filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()));

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit contact" : "New contact"}
      width="xl"
      submitLabel={isEdit ? "Save changes" : "Create contact"}
      submitting={submitting}
      submitDisabled={loading || (!isEdit && !form.email.trim())}
      onSubmit={handleSubmit}
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Basic info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" required={!isEdit}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
                disabled={isEdit}
                title={isEdit ? "Email cannot be changed" : undefined}
              />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="+1 555 0100" />
            </Field>
            <Field label="First name">
              <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Last name">
              <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Language">
              <select value={form.language} onChange={(e) => set("language", e.target.value)} className={inputCls}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Company">
              <input value={form.company} onChange={(e) => set("company", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Address</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Street address">
              <input value={form.streetAddress} onChange={(e) => set("streetAddress", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Street number">
              <input value={form.streetNumber} onChange={(e) => set("streetNumber", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Neighborhood">
              <input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Postal code">
              <input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={inputCls} />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </Field>
            <Field label="State / Province">
              <input value={form.state} onChange={(e) => set("state", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Country">
              <select value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls}>
                <option value="">—</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tax number">
              <input value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom fields</h3>
            <button
              type="button"
              onClick={() => setCustomFields((f) => [...f, { key: "", value: "" }])}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus size={12} />
              Add field
            </button>
          </div>
          {customFields.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No custom fields</p>
          ) : (
            <div className="space-y-2">
              {customFields.map((cf, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={cf.key}
                    onChange={(e) => setCustomFields((prev) => prev.map((p, idx) => idx === i ? { ...p, key: e.target.value } : p))}
                    placeholder="Field name"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={cf.value}
                    onChange={(e) => setCustomFields((prev) => prev.map((p, idx) => idx === i ? { ...p, value: e.target.value } : p))}
                    placeholder="Value"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => setCustomFields((f) => f.filter((_, idx) => idx !== i))} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</h3>
            {allTags.length > 5 && (
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags"
                className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
              />
            )}
          </div>
          {filteredTags.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No tags found</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredTags.map((tag) => {
                const selected = selectedTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selected ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                    style={selected ? { backgroundColor: tag.color ?? "#6366f1" } : undefined}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selected ? "white" : (tag.color ?? "#6366f1") }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
      )}
    </FormDrawer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
