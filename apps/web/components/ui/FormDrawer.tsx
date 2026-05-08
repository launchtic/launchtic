"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";

type Width = "sm" | "md" | "lg" | "xl";

const WIDTH_MAP: Record<Width, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: Width;
  submitLabel?: string;
  onSubmit?: () => void | Promise<void>;
  submitting?: boolean;
  submitDisabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
};

export default function FormDrawer({
  open, onClose, title, description,
  width = "md", submitLabel = "Save", onSubmit,
  submitting = false, submitDisabled = false, destructive = false,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const primaryBtn = destructive
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{ animation: "drawerFadeIn 150ms ease-out" }}
        onClick={() => !submitting && onClose()}
      />

      <div
        className={`relative ml-auto w-full ${WIDTH_MAP[width]} bg-white h-full flex flex-col shadow-2xl`}
        style={{ animation: "drawerSlideIn 220ms cubic-bezier(0.32,0.72,0,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{title}</h2>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {onSubmit ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
              className="h-full flex flex-col"
            >
              <div className="flex-1 px-5 sm:px-6 py-5">{children}</div>
              <FormFooter
                onClose={onClose}
                submitting={submitting}
                submitDisabled={submitDisabled}
                submitLabel={submitLabel}
                primaryBtn={primaryBtn}
              />
            </form>
          ) : (
            <div className="px-5 sm:px-6 py-5">{children}</div>
          )}
        </div>
      </div>

    </div>,
    document.body
  );
}

function FormFooter({
  onClose, submitting, submitDisabled, submitLabel, primaryBtn,
}: {
  onClose: () => void;
  submitting: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  primaryBtn: string;
}) {
  return (
    <div className="sticky bottom-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting || submitDisabled}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white ${primaryBtn} disabled:opacity-50 rounded-xl transition-colors`}
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
