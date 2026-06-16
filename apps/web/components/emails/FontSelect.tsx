"use client";

import { Type } from "lucide-react";
import { EMAIL_FONTS, DEFAULT_EMAIL_FONT } from "@launchtic/email";

// Per-email font picker (curated web-safe list). Value is the font name;
// applies to the whole email (theme), not per-text — matches what
// @maily-to/render actually honors. Used by every email editor surface.
export default function FontSelect({
  value, onChange, className,
}: {
  value: string | null;
  onChange: (font: string) => void;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 ${className ?? ""}`} title="Email font">
      <Type size={14} className="text-gray-400 shrink-0" />
      <select
        value={value ?? DEFAULT_EMAIL_FONT}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {EMAIL_FONTS.map((f) => (
          <option key={f.name} value={f.name} style={{ fontFamily: f.fontFamily }}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
