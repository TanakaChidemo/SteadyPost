"use client";

import React from "react";
import Link from "next/link";
import { useAppStore } from "../lib/store";
import { SparklesIcon, PlusIcon, UsersIcon } from "./Icons";

export function Navbar() {
  const { user, logout, setAuthModalOpen, setAiModalOpen, socialAccounts } = useAppStore();

  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-slate-800/80 bg-slate-950/80 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-md gradient-brand flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-lg text-white tracking-tight">SteadyPost</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              PRO
            </span>
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {/* Connected Channels Pill */}
        <Link
          href="/dashboard/accounts"
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:border-slate-700 transition"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{socialAccounts.length} Channels Connected</span>
        </Link>

        {/* AI Assistant Quick Trigger */}
        <button
          onClick={() => setAiModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/40 text-purple-200 hover:border-purple-400 text-xs font-medium transition"
        >
          <SparklesIcon className="w-4 h-4 text-purple-400" />
          <span className="hidden sm:inline">AI Studio</span>
        </button>

        {/* Create Post Action */}
        <Link
          href="/dashboard/content"
          className="flex items-center gap-1.5 px-4 py-1.5 rounded gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Post</span>
        </Link>

        {/* User Account / Auth */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-indigo-300">
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-200">{user.name}</span>
              <span className="text-[10px] text-slate-400">{user.email}</span>
            </div>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1 transition"
              title="Sign Out"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAuthModalOpen(true)}
            className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
