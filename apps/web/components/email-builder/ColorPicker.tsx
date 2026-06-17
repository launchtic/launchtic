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
  const pickerRef = useRef<HTMLDivElement>(null);

  // Commit to the editor only when the drag ENDS (mouseup) — not on every Sketch
  // change. Committing live would setProp → re-render the whole editor every
  // frame, remounting the picker mid-drag (it loses pointer capture and appears
  // to close). During the drag we only update local `cur`; the canvas updates
  // once on release. A short debounce covers hex typing / keyboard input.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const pending = useRef<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = () => {
    if (tRef.current) { clearTimeout(tRef.current); tRef.current = null; }
    if (pending.current != null) { const v = pending.current; pending.current = null; onChangeRef.current(v); }
  };
  const handleChange = (c: any) => {
    const hex = c.rgba ? rgbaObjToHex(c.rgba) : c.hex;
    setCur(hex);
    pending.current = hex;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(commit, 400);
  };
  useEffect(() => {
    const up = () => commit();
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mouseup", up); commit(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Close on a press that STARTS outside the picker (and not on the anchor,
  // which toggles itself). Keying off mousedown — not click — means dragging a
  // slider (mousedown inside, release outside) never closes it: the release is
  // a mouseup, not a mousedown.
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (pickerRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchorEl, onClose]);

  useEffect(() => { setCur(normalize(color)); }, [color]);

  return createPortal(
    <div ref={pickerRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 70, opacity: ready ? 1 : 0, boxShadow: "0 4px 20px rgba(0,0,0,.15)", borderRadius: 8, overflow: "hidden" }}>
      <Sketch
        color={cur}
        disableAlpha={false}
        onChange={handleChange}
        style={{ boxShadow: "none" }}
      />
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
