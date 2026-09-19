"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayersIcon,
  SparklesIcon,
  UsersIcon,
  InstagramIcon,
  FacebookIcon,
} from "./Icons";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayersIcon },
  { href: "/dashboard/content", label: "Content Studio", icon: SparklesIcon, badge: "AI" },
  { href: "/dashboard/accounts", label: "Social Accounts", icon: UsersIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { authReady, token, socialAccounts, setSocialAccounts } = useAppStore();

  // The sidebar is mounted on every dashboard page, so this is also what
  // populates socialAccounts for pages (like Overview) that display connection
  // state but don't fetch it themselves.
  useEffect(() => {
    if (!authReady) return;
    api.socialAccounts
      .list()
      .then(setSocialAccounts)
      .catch(() => {});
  }, [authReady, token, setSocialAccounts]);

  const isConnected = (platform) => socialAccounts.some((a) => a.platform === platform);

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-slate-950/60 p-4 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-4rem)]">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            Platform Menu
          </p>
          <nav className="mt-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/30 text-[10px] font-semibold text-indigo-300">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Connected Channels Summary Widget */}
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-300">Active Channels</span>
            <Link
              href="/dashboard/accounts"
              className="text-[11px] text-indigo-400 hover:text-indigo-300"
            >
              Manage
            </Link>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />
                <span>Instagram</span>
              </div>
              <span
                className={`w-2 h-2 rounded-full ${isConnected("instagram") ? "bg-emerald-400" : "bg-slate-700"}`}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <FacebookIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Facebook</span>
              </div>
              <span
                className={`w-2 h-2 rounded-full ${isConnected("facebook") ? "bg-emerald-400" : "bg-slate-700"}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Publishing Status Banner */}
      <div className="p-3.5 rounded-lg bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-indigo-800/40 text-xs">
        <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-1">
          <SparklesIcon className="w-3.5 h-3.5" />
          <span>AI Engine Active</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Cross-platform repurposing and automated caption generation enabled.
        </p>
      </div>
    </aside>
  );
}
