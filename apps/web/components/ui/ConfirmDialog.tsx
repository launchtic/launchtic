"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "default";
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type DialogState = ConfirmOptions & { resolve: (v: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const t = useTranslations("common");

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  function handleResolve(value: boolean) {
    dialog?.resolve(value);
    setDialog(null);
  }

  const colorMap = {
    danger:  { icon: "text-red-500",    bg: "bg-red-50",    btn: "bg-red-600 hover:bg-red-700 text-white" },
    warning: { icon: "text-amber-500",  bg: "bg-amber-50",  btn: "bg-amber-500 hover:bg-amber-600 text-white" },
    default: { icon: "text-blue-500",   bg: "bg-blue-50",   btn: "bg-blue-600 hover:bg-blue-700 text-white" },
  };
  const colors = colorMap[dialog?.variant ?? "default"];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => handleResolve(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full ${colors.bg} flex items-center justify-center mb-4`}>
                <TriangleAlert size={22} className={colors.icon} />
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1.5">{dialog.title}</h2>
              {dialog.description && (
                <p className="text-sm text-gray-500 leading-relaxed">{dialog.description}</p>
              )}
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button
                onClick={() => handleResolve(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => handleResolve(true)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${colors.btn}`}
              >
                {dialog.confirmLabel ?? t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
