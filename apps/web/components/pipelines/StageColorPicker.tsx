"use client";

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { STAGE_PALETTE } from "../../lib/pipeline-colors";

// A color dot that opens a small popover: preset swatches + a native custom
// picker. Used on the board stage header and in the Edit-pipeline modal.
export default function StageColorPicker({
  color,
  onChange,
  size = 12,
  disabled = false,
}: {
  color: string | null;
  onChange: (hex: string) => void;
  size?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = color ?? "#94a3b8";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(hex: string) {
    onChange(hex);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full ring-2 ring-white shadow-sm hover:scale-110 transition-transform disabled:cursor-default disabled:hover:scale-100"
        style={{ width: size, height: size, backgroundColor: current }}
        title={disabled ? undefined : "Change color"}
        aria-label="Stage color"
      />

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-44 bg-white border border-gray-200 rounded-xl shadow-lg p-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            {STAGE_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              >
                {current.toLowerCase() === c.toLowerCase() && <Check size={13} className="text-white" />}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-500 cursor-pointer">
            <input
              type="color"
              value={current}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-gray-200 bg-transparent p-0"
            />
            Custom
          </label>
        </div>
      )}
    </div>
  );
}
