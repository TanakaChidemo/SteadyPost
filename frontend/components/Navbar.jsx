"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "../lib/store";
import { can } from "../lib/roles";
import { SparklesIcon, PlusIcon, UsersIcon } from "./Icons";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { BusinessProfileModal } from "./BusinessProfileModal";
import { OnboardingWizard } from "./OnboardingWizard";
import { UserMenu } from "./UserMenu";

export function Navbar() {
  const {
    user,
    setAuthModalOpen,
    setAiModalOpen,
    socialAccounts,
    currentWorkspace,
    onboarding,
    onboardingDismissed,
    openOnboarding,
  } = useAppStore();

  // Send owners and editors of a workspace that hasn't been onboarded through
  // the wizard. Viewers can't save a profile, so they're left alone.
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const needsOnboarding =
    Boolean(user && workspaceId) &&
    currentWorkspace.onboardingComplete === false &&
    ["owner", "editor"].includes(currentWorkspace.role) &&
    !onboardingDismissed.includes(workspaceId);

  // The channels pill counts the active profile's channels, so it needs one that's set up.
  const hasProfile = Boolean(user && workspaceId && currentWorkspace.onboardingComplete);

  useEffect(() => {
    if (needsOnboarding && !onboarding) openOnboarding("complete");
    // Only re-check when the workspace or its status changes, not on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOnboarding, workspaceId]);

  return (
    <>
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

          {/* Workspace / Business Venture Selector */}
          {user && <WorkspaceSelector />}
        </div>

      <div className="flex items-center gap-3">
        {/* Connected Channels Pill */}
        {hasProfile && (
          <Link
            href="/dashboard/accounts"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:border-slate-700 transition"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{socialAccounts.length} Channels Connected</span>
          </Link>
        )}

        {/* AI Assistant Quick Trigger (not for viewers: every AI action writes) */}
        {user && can(currentWorkspace, "ai.use") && (
          <button
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/40 text-purple-200 hover:border-purple-400 text-xs font-medium transition"
          >
            <SparklesIcon className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Write with AI</span>
          </button>
        )}

        {/* Create Post Action (signed out, it asks you to sign in instead; viewers can't write posts) */}
        {(!user || can(currentWorkspace, "post.write")) && (
        <Link
          href="/dashboard/content"
          onClick={(e) => {
            if (!user) {
              e.preventDefault();
              setAuthModalOpen(true);
            }
          }}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Post</span>
        </Link>
        )}

        {/* User Account / Auth */}
        {user ? (
          <div className="pl-2 border-l border-slate-800">
            <UserMenu showBusinessProfile />
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
    <BusinessProfileModal />
    <OnboardingWizard />
    </>
  );
}
