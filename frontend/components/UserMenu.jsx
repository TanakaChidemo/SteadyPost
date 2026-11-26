"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppStore } from "../lib/store";
import { can } from "../lib/roles";
import { LayersIcon, UsersIcon, TeamIcon } from "./Icons";

// The signed-in user's avatar and name; clicking them opens the account menu (with Sign out).
// `showBusinessProfile`: only where the Business Profile box is on the page (the dashboard).
export function UserMenu({ showBusinessProfile = false }) {
  const { user, logout, currentWorkspace, setBusinessProfileOpen } = useAppStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const initial = user.name ? user.name.charAt(0).toUpperCase() : "U";
  const close = () => setOpen(false);
  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white focus:outline-none transition text-left";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition"
      >
        <span className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-indigo-300">
          {initial}
        </span>
        <span className="hidden sm:inline text-xs font-semibold text-slate-200 max-w-[10rem] truncate">{user.name}</span>
        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 z-40 rounded-lg border border-slate-800 bg-slate-900 p-1.5 shadow-xl animate-fade-in"
        >
          <div className="px-3 py-2 border-b border-slate-800 mb-1">
            <div className="text-xs font-semibold text-slate-200 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
          </div>

          <Link href="/dashboard" role="menuitem" onClick={close} className={itemClass}>
            <LayersIcon className="w-4 h-4" /> Dashboard
          </Link>
          {showBusinessProfile && can(currentWorkspace, "profile.update") && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                setBusinessProfileOpen(true);
              }}
              className={itemClass}
            >
              <span className="w-4 text-center text-sm leading-none">🏢</span> Business Profile
            </button>
          )}
          <Link href="/dashboard/accounts" role="menuitem" onClick={close} className={itemClass}>
            <UsersIcon className="w-4 h-4" /> Social Accounts
          </Link>
          <Link href="/dashboard/team" role="menuitem" onClick={close} className={itemClass}>
            <TeamIcon className="w-4 h-4" /> Team
          </Link>

          <div className="border-t border-slate-800 mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                logout();
              }}
              className={`${itemClass} hover:text-rose-300 focus:text-rose-300`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
