"use client";

// Full color picker for the email builder (hue/saturation/hex/alpha), ported
// from the landing-page editor's ColorPickerPopup. Used for element color
// settings and inline text color. Value in/out is a hex string (#RGB/#RRGGBB
// or #RRGGBBAA when alpha < 1).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Sketch from "@uiw/react-color-sketch";

const toHex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
function rgbaObjToHex(rgba: { r: number; g: number; b: number; a?: number }) {
  const a = rgba.a ?? 1;
  return `#${toHex2(rgba.r)}${toHex2(rgba.g)}${toHex2(rgba.b)}${a < 1 ? toHex2(a * 255) : ""}`;
}
// Sketch wants hex; our values are hex or "transparent".
const normalize = (c?: string) => (!c || c === "transparent" || !c.startsWith("#") ? "#000000" : c);

export function ColorPickerPopup({
  color, onChange, onClose, anchorEl,
}: { color: string; onChange: (hex: string) => void; onClose: () => void; anchorEl: HTMLElement | null }) {
  const [cur, setCur] = useState(() => normalize(color));
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = 240, h = 320;
    let top = r.bottom + 6;
    let left = r.left;
    if (left + w > window.innerWidth) left = window.innerWidth - w - 10;
    if (top + h > window.innerHeight) top = r.top - h - 6;
    setPos({ top: Math.max(top, 8), left: Math.max(left, 8) });
    setReady(true);
  }, [anchorEl]);

  useEffect(() => {
    const e = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", e);
    return () => document.removeEventListener("keydown", e);
  }, [onClose]);

  useEffect(() => { setCur(normalize(color)); }, [color]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      <div style={{ position: "absolute", inset: 0 }} onMouseDown={onClose} />
      <div style={{ position: "absolute", top: pos.top, left: pos.left, opacity: ready ? 1 : 0, boxShadow: "0 4px 20px rgba(0,0,0,.15)", borderRadius: 8, overflow: "hidden" }}
        onMouseDown={(e) => e.preventDefault()}>
        <Sketch
          color={cur}
          disableAlpha={false}
          onChange={(c: any) => { const hex = c.rgba ? rgbaObjToHex(c.rgba) : c.hex; setCur(hex); onChange(hex); }}
          style={{ boxShadow: "none" }}
        />
      </div>
    </div>,
    document.body,
  );
}

// Swatch button that opens the picker — used in the settings panel.
export function ColorSwatchButton({ value, onChange, title }: { value?: string; onChange: (hex: string) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const transparent = !value || value === "transparent";
  return (
    <>
      <button
        type="button"
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        title={title}
        className="h-8 w-12 rounded border border-gray-200 shrink-0"
        style={transparent
          ? { backgroundImage: "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,#fff 25%,#fff 75%,#ddd 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }
          : { background: value }}
      />
      {open && <ColorPickerPopup color={transparent ? "#ffffff" : (value as string)} anchorEl={ref.current} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}
