"use client";

import React from "react";
import { useAppStore } from "../lib/store";

/** Shown in place of a dashboard page that needs an account. */
export function SignInPrompt({ title, children }) {
  const setAuthModalOpen = useAppStore((state) => state.setAuthModalOpen);

  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-lg bg-slate-900/80 border border-slate-800 text-center space-y-3">
      <h1 className="text-lg font-bold text-white">{title}</h1>
      <p className="text-xs text-slate-400">{children}</p>
      <button
        onClick={() => setAuthModalOpen(true)}
        className="px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
      >
        Sign In
      </button>
    </div>
  );
}
