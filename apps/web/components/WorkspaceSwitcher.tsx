"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Building2 } from "lucide-react";

type Workspace = { id: string; name: string; slug: string };

// Two render modes (driven by `canSwitch`):
//   - false → static badge: just shows the workspace name, no click. Used
//     when the Agency operator has only 1 workspace (identity affordance).
//   - true  → dropdown: lists all workspaces for one-click switching.
// Workspace creation lives in Settings → Workspaces (intentionally not
// surfaced here — keeps the switcher focused on "switch", not "manage").
// Navigation is URL-driven (router.push to /{slug}/dashboard); no session
// update needed since workspace context comes from URL header per request.
export default function WorkspaceSwitcher({
  currentSlug,
  currentName,
  workspaces,
  canSwitch,
}: {
  currentSlug: string;
  currentName: string;
  workspaces: Workspace[];
  canSwitch: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleSwitch(ws: Workspace) {
    if (ws.slug === currentSlug) { setOpen(false); return; }
    setOpen(false);
    router.push(`/${ws.slug}/dashboard`);
  }

  // ─── Static badge (Agency with single workspace) ─────────────────────────
  if (!canSwitch) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-700 max-w-[180px] shrink-0">
        <Building2 size={14} className="shrink-0 text-gray-400" />
        <span className="truncate">{currentName}</span>
      </div>
    );
  }

  // ─── Dropdown (Agency with 2+ workspaces) ────────────────────────────────
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors max-w-[180px]"
      >
        <Building2 size={14} className="shrink-0 text-gray-400" />
        <span className="truncate">{currentName}</span>
        <ChevronDown size={13} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Workspaces
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => handleSwitch(ws)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
            >
              <span className="truncate text-gray-700">{ws.name}</span>
              {ws.slug === currentSlug && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 ml-2" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
