"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@launchtic/types";
import FormDrawer from "../ui/FormDrawer";

const CURRENCIES = SUPPORTED_CURRENCIES;

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function ProductQuickCreateDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const t = useTranslations("products.quickCreate");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCurrency("usd");
      setError("");
    }
  }, [open]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("errorNameRequired")); return; }

    setSubmitting(true);
    setError("");
    const res = await fetch("/api/physical-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, currency }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(json.error ?? t("errorCreate")); return; }

    onCreated?.(json.id);
  }

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      width="sm"
      submitLabel={t("submitLabel")}
      submitting={submitting}
      submitDisabled={!name.trim()}
      onSubmit={handleSubmit}
    >
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t("nameLabel")} <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("currencyLabel")}</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputCls}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </FormDrawer>
  );
}
