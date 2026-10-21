"use client";

import React from "react";
import Link from "next/link";
import { useAppStore } from "../lib/store";
import { SparklesIcon, PlusIcon, MenuIcon } from "./Icons";
import { Button, IconButton } from "./ui/Button";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { Badge } from "./ui/Badge";

export function Topbar({ onMenuClick }) {
  const { user, setAuthModalOpen, setAiModalOpen, socialAccounts } = useAppStore();

  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-line bg-surface/90 backdrop-blur">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconButton label="Open navigation menu" onClick={onMenuClick} className="md:hidden -ml-2">
            <MenuIcon className="w-5 h-5" />
          </IconButton>
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0" aria-label="SteadyPost home">
            <span className="w-9 h-9 rounded-[10px] bg-brand-500 border border-brand-600 flex items-center justify-center shadow-1">
              <SparklesIcon className="w-5 h-5 text-white" />
            </span>
            <span className="hidden sm:flex flex-col leading-none">
              <span className="font-bold text-body text-ink tracking-tight">SteadyPost</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                Content Studio
              </span>
            </span>
            <Badge tone="bg-brand-50 text-brand-700 border-brand-500/30">PRO</Badge>
          </Link>
          <div className="hidden lg:block w-52">
            <WorkspaceSwitcher compact />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/dashboard/accounts"
            className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-card border border-line text-caption text-ink-2 hover:border-line-strong hover:text-ink transition shadow-1"
          >
            <span
              className={`w-2 h-2 rounded-full ${socialAccounts.length > 0 ? "bg-success animate-pulse" : "bg-ink-3/40"}`}
              aria-hidden="true"
            />
            <span className="font-mono uppercase tracking-[0.04em] text-micro">
              {socialAccounts.length} {socialAccounts.length === 1 ? "Channel" : "Channels"}
            </span>
          </Link>

          <Button variant="ai" size="sm" onClick={() => setAiModalOpen(true)} className="hidden sm:inline-flex">
            <SparklesIcon className="w-4 h-4" aria-hidden="true" />
            <span>AI Studio</span>
          </Button>
          <IconButton
            label="Open AI Studio"
            onClick={() => setAiModalOpen(true)}
            className="sm:hidden border border-ai-500/30 text-ai-500"
          >
            <SparklesIcon className="w-5 h-5" />
          </IconButton>

          <Link href="/dashboard/content">
            <Button size="sm">
              <PlusIcon className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">New Post</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>

          {user ? (
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-line">
              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-brand-500 border border-brand-600 flex items-center justify-center text-caption font-bold text-white"
              >
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </span>
              <div className="hidden lg:flex flex-col text-left leading-tight">
                <span className="text-caption font-semibold text-ink">{user.name}</span>
                <span className="text-micro text-ink-3">{user.email}</span>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAuthModalOpen(true)}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
