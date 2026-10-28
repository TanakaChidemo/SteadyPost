"use client";

import React from "react";
import { useAppStore } from "../lib/store";
import { CheckIcon, TrashIcon } from "./Icons";

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-md border ${
            toast.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : toast.type === "error"
              ? "bg-rose-950/80 border-rose-500/40 text-rose-200"
              : "bg-slate-900/90 border-indigo-500/40 text-indigo-200"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {toast.type === "success" ? (
              <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {toast.action && (
              <button
                onClick={() => {
                  removeToast(toast.id);
                  toast.action.onClick();
                }}
                className="text-xs font-semibold px-2 py-1 rounded border border-current/30 hover:bg-white/10 transition whitespace-nowrap"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-xs opacity-60 hover:opacity-100 transition p-1"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
