"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../components/ui/ConfirmDialog";

type Ctx = { setDirty: (dirty: boolean) => void };

const UnsavedChangesContext = createContext<Ctx | null>(null);

// Page hook: pass current dirty flag. Cleans up on unmount so leaving a clean
// page never keeps a stale "dirty" registered.
export function useUnsavedChanges(dirty: boolean) {
  const ctx = useContext(UnsavedChangesContext);
  useEffect(() => {
    ctx?.setDirty(dirty);
    return () => ctx?.setDirty(false);
  }, [dirty, ctx]);
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirtyRef = useRef(false);
  const confirm = useConfirm();
  const router = useRouter();

  function setDirty(d: boolean) { dirtyRef.current = d; }

  // Hard navigation (reload, tab close, external URL): native browser dialog.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // In-app navigation (any <a>/<Link> click): intercept at document level so
  // every link in the app is covered without per-component wiring.
  useEffect(() => {
    let confirming = false;
    const handler = async (e: MouseEvent) => {
      if (!dirtyRef.current || confirming) return;
      // Modifier keys / non-primary button / new tab → let the browser handle it.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      let el: HTMLElement | null = e.target as HTMLElement;
      while (el && el.tagName !== "A") el = el.parentElement;
      if (!el) return;
      const a = el as HTMLAnchorElement;

      if (!a.href || a.target === "_blank") return;
      if (a.origin !== window.location.origin) return;
      // Same URL → no navigation, no prompt.
      if (a.href === window.location.href) return;
      // Honor explicit opt-out (e.g. logout buttons).
      if (a.dataset.skipUnsavedGuard === "true") return;

      e.preventDefault();
      e.stopPropagation();
      confirming = true;
      const ok = await confirm({
        title: "Discard unsaved changes?",
        description: "You have unsaved edits. Leaving this page will lose them.",
        confirmLabel: "Discard",
        variant: "warning",
      });
      confirming = false;
      if (ok) {
        dirtyRef.current = false;
        router.push(a.pathname + a.search + a.hash);
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [confirm, router]);

  return (
    <UnsavedChangesContext.Provider value={{ setDirty }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}
