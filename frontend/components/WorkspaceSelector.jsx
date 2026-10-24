"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { PlusIcon } from "./Icons";

export function WorkspaceSelector() {
  const {
    user,
    workspaces,
    currentWorkspace,
    switchWorkspace,
    fetchWorkspaces,
    setBusinessProfileOpen,
    openOnboarding,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
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
              onClick={() => {
                setIsOpen(false);
                openOnboarding("create");
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>+ Create New Business Profile</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
