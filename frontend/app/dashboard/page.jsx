"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "../../lib/store";
import { api } from "../../lib/apiClient";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  LayersIcon,
  PlusIcon,
  ArrowUpRightIcon,
  SendIcon,
} from "../../components/Icons";

export default function DashboardOverviewPage() {
  const { user, authReady, token, drafts, setDrafts, socialAccounts, addToast, setAiModalOpen } = useAppStore();

  const [quickPost, setQuickPost] = useState("");
  const [quickPlatform, setQuickPlatform] = useState("instagram");
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    // Wait for auth to be resolved (token restored from localStorage) so this
    // doesn't fire before login and silently 401, leaving stats stuck at 0.
    if (authReady) loadData();
  }, [authReady, token]);

  async function loadData() {
    try {
      const draftItems = await api.content.list();
      setDrafts(draftItems);
    } catch (err) {
      // fallback
    }
  }

  async function handleQuickPublish() {
    if (!quickPost.trim()) return addToast("error", "Write some text to publish");
    setIsPublishing(true);
    try {
      const draft = await api.content.create({
        title: `Quick Post (${quickPlatform})`,
        body: quickPost,
        platforms: [quickPlatform],
      });
      const { postId } = await api.publish.now({
        contentDraftId: draft._id,
        platform: quickPlatform,
      });
      const result = await api.publish.waitForResult(postId);
      if (result.status === "published") {
        addToast("success", `🚀 Published to ${quickPlatform}!`);
        setQuickPost("");
      } else {
        addToast("error", `Failed to publish to ${quickPlatform}: ${result.errorMessage || "Publishing did not complete"}`);
      }
      loadData();
    } catch (err) {
      addToast("error", err.message || "Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Welcome back, {user?.name || "Tanaka Chidemo"} 👋
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Here is what is happening across your social channels today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-purple-950/60 border border-purple-500/40 text-purple-300 text-xs font-semibold hover:border-purple-400 transition"
          >
            <SparklesIcon className="w-4 h-4 text-purple-400" />
            <span>AI Copywriter</span>
          </button>
          <Link
            href="/dashboard/content"
            className="flex items-center gap-1.5 px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Campaign</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Audience Reach</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              +18.4% <ArrowUpRightIcon className="w-3 h-3" />
            </span>
          </div>
          <div className="text-2xl font-bold text-white">24,850</div>
          <p className="text-[11px] text-slate-500">Across connected networks</p>
        </div>

        <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Drafts in Studio</span>
            <span className="text-slate-400 font-semibold">{drafts.length} total</span>
          </div>
          <div className="text-2xl font-bold text-white">{drafts.length}</div>
          <p className="text-[11px] text-slate-500">Ready for editing and review</p>
        </div>

        <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Channels Connected</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 100% Synced
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{socialAccounts.length} / 2</div>
          <p className="text-[11px] text-slate-500">Instagram, Facebook</p>
        </div>
      </div>

      {/* Quick Composer */}
      <div className="grid grid-cols-1 gap-6">
        <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <LayersIcon className="w-4 h-4 text-indigo-400" />
              <span>Quick Composer</span>
            </h3>
            <div className="flex items-center gap-1.5">
              {[
                { id: "instagram", icon: InstagramIcon, color: "text-pink-400" },
                { id: "facebook", icon: FacebookIcon, color: "text-blue-500" },
              ].map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setQuickPlatform(p.id)}
                    className={`p-1.5 rounded border transition ${
                      quickPlatform === p.id
                        ? "bg-slate-800 border-indigo-500/50" + p.color
                        : "bg-slate-950 border-slate-800 text-slate-600 hover:text-slate-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            rows={4}
            value={quickPost}
            onChange={(e) => setQuickPost(e.target.value)}
            placeholder={`Draft a quick update for ${quickPlatform}... (or click"AI Copywriter" for assistance)`}
            className="w-full px-4 py-3 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-sans"
          />

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/dashboard/content"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Open Full Studio with Live Preview →
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAiModalOpen(true)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-1"
              >
                <SparklesIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>AI</span>
              </button>
              <button
                onClick={handleQuickPublish}
                disabled={isPublishing}
                className="px-4 py-1.5 rounded gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center gap-1.5"
              >
                <SendIcon className="w-3.5 h-3.5" />
                <span>{isPublishing ? "Publishing..." : "Publish Now"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
