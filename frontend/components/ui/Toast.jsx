"use client";

import React from "react";
import { useAppStore } from "../../lib/store";
import { CheckIcon, CloseIcon } from "../Icons";
import { cn } from "../../lib/cn";

const TONES = {
  success: "bg-success-bg border-success/30",
  error: "bg-danger-bg border-danger/30",
  info: "bg-info-bg border-info/30",
};

const ICONS = {
  success: <CheckIcon className="w-4 h-4 text-success shrink-0" aria-hidden="true" />,
  error: <CloseIcon className="w-4 h-4 text-danger shrink-0" aria-hidden="true" />,
  info: <span className="w-2 h-2 rounded-full bg-info shrink-0" aria-hidden="true" />,
};

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100%-2.5rem)] pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-center justify-between gap-3 px-4 py-3",
            "rounded-[14px] border shadow-modal bg-card animate-scale-in",
            TONES[toast.type] || TONES.info
          )}
        >
          <div className="flex items-center gap-2.5 text-body-sm font-medium text-ink">
            {ICONS[toast.type] || ICONS.info}
            <span>{toast.text}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
            className="p-1 rounded text-ink-3 hover:text-ink transition shrink-0"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
