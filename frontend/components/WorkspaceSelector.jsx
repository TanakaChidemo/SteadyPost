"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { PlusIcon } from "./Icons";

export function WorkspaceSelector() {
  const {
    user,
    workspaces,
    currentWorkspace,
    switchWorkspace,
    fetchWorkspaces,
    setBusinessProfileOpen,
    addToast,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newBusinessType, setNewBusinessType] = useState("");
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newOffer, setNewOffer] = useState("");
  const [newAudience, setNewAudience] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const currentId = currentWorkspace?.id || currentWorkspace?._id;
  const currentRole = currentWorkspace?.role || "owner";

  async function handleCreateWorkspace(e) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await api.workspaces.create({
        name: newWorkspaceName.trim(),
        businessType: newBusinessType.trim() || undefined,
        websiteUrl: newWebsiteUrl.trim() || undefined,
        offer: newOffer.trim() || undefined,
        audience: newAudience.trim() || undefined,
      });
      await fetchWorkspaces();
      if (res.workspace?.id) {
        await switchWorkspace(res.workspace.id);
      }
      addToast("success", `Created business profile "${newWorkspaceName}"`);
      setNewWorkspaceName("");
      setNewBusinessType("");
      setNewWebsiteUrl("");
      setNewOffer("");
      setNewAudience("");
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      addToast("error", err.response?.data?.error || "Failed to create profile");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Workspace / Profile Trigger Button */}
      <button
        onClick={() => {
          if (!isOpen) fetchWorkspaces();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition group"
      >
        <div className="w-5 h-5 rounded bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-[10px]">
          🏢
        </div>
        <div className="text-left max-w-[130px] sm:max-w-[180px] truncate">
          <div className="font-semibold truncate text-slate-100">
            {currentWorkspace?.name || "Select Profile"}
          </div>
          {currentWorkspace?.businessType && (
            <div className="text-[10px] text-slate-400 truncate -mt-0.5">
              {currentWorkspace.businessType}
            </div>
          )}
        </div>
        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-0.5">
          {currentRole}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Business Profiles ({workspaces.length})
            </span>
            <button
              onClick={() => {
                setIsOpen(false);
                setBusinessProfileOpen(true);
              }}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Profile Settings
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 py-1">
            {workspaces.map((ws) => {
              const wsId = ws.id || ws._id;
              const isSelected = wsId === currentId;
              return (
                <button
                  key={wsId}
                  onClick={() => {
                    if (!isSelected) switchWorkspace(wsId);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition ${
                    isSelected
                      ? "bg-indigo-600/20 text-indigo-200 border border-indigo-500/30"
                      : "text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-sm shrink-0">🏢</span>
                    <div className="truncate">
                      <div className="font-medium truncate text-slate-100">
                        {ws.name || "Untitled Profile"}
                      </div>
                      {ws.businessType && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {ws.businessType}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 capitalize">
                      {ws.role || "member"}
                    </span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Action Row: Create New Business Profile */}
          <div className="pt-2 mt-1 border-t border-slate-800/80">
            <button
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>+ Create New Business Profile</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Profile Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-white">Create New Business Profile</h3>
              <button
                onClick={() => setIsCreating(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center hover:bg-slate-900 transition"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Each profile gets its own brand tone, connected social channels, content calendar, and notification budget.
            </p>

            <form onSubmit={handleCreateWorkspace} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Profile / Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Apparel, SteadyPost Marketing"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Business Type / Industry (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. E-commerce Brand, Local Bakery, SaaS"
                  value={newBusinessType}
                  onChange={(e) => setNewBusinessType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Website URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="e.g. https://apexapparel.com"
                  value={newWebsiteUrl}
                  onChange={(e) => setNewWebsiteUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Audience (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Founders, Local shoppers, Tech enthusiasts"
                  value={newAudience}
                  onChange={(e) => setNewAudience(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Core Offer (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Custom athletic wear and eco-friendly accessories."
                  value={newOffer}
                  onChange={(e) => setNewOffer(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300 hover:bg-slate-900 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newWorkspaceName.trim()}
                  className="px-4 py-1.5 rounded-lg gradient-brand text-xs font-semibold text-white hover:opacity-95 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
