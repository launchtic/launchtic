"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "warning" | "info";

type ToastOptions = {
  duration?: number;
};

type ToastItem = {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
};

type ToastContextValue = {
  show: (variant: ToastVariant, message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  error:   (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
  info:    (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Default durations per variant — errors linger longer because users need to
// read them; success/info are ephemeral acknowledgements.
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3000,
  info:    4000,
  warning: 5000,
  error:   6000,
};

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (variant: ToastVariant, message: string, opts?: ToastOptions) => {
      const id = ++idRef.current;
      const duration = opts?.duration ?? DEFAULT_DURATION[variant];
      setToasts((prev) => [...prev, { id, variant, message, duration }]);
    },
    [],
  );

  const value: ToastContextValue = {
    show,
    success: (m, o) => show("success", m, o),
    error:   (m, o) => show("error",   m, o),
    warning: (m, o) => show("warning", m, o),
    info:    (m, o) => show("info",    m, o),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Stack — fixed bottom-right. pointer-events-none on container so
          background is still interactive; toasts re-enable on themselves. */}
      <div
        aria-live="polite"
        className="fixed z-[100] top-4 right-4 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; text: string; iconColor: string; Icon: typeof CheckCircle2 }
> = {
  success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconColor: "text-emerald-600", Icon: CheckCircle2 },
  error:   { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-900",     iconColor: "text-red-600",     Icon: AlertCircle  },
  warning: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900",   iconColor: "text-amber-600",   Icon: AlertTriangle},
  info:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-900",    iconColor: "text-blue-600",    Icon: Info         },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const s = VARIANT_STYLES[item.variant];

  // Auto-dismiss with leave animation. Timing: full duration shows the toast,
  // then 200ms slide-out, then unmount.
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), item.duration);
    const t2 = setTimeout(onDismiss, item.duration + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [item.duration, onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-xl border shadow-md
        ${s.bg} ${s.border} ${s.text}
        transition-all duration-200 ease-out
        ${leaving ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"}`}
    >
      <s.Icon size={16} className={`shrink-0 mt-0.5 ${s.iconColor}`} />
      <p className="flex-1 text-sm leading-snug">{item.message}</p>
      <button
        onClick={() => { setLeaving(true); setTimeout(onDismiss, 200); }}
        className={`shrink-0 -mr-1 -mt-0.5 p-1 rounded-md hover:bg-black/5 ${s.iconColor}`}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
