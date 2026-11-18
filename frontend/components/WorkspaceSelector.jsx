"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { GearIcon, PlusIcon } from "./Icons";

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
  // Businesses the user owns, and other people's businesses they help with.
  const businesses = workspaces.filter((ws) => ws.role === "owner");
  const teams = workspaces.filter((ws) => ws.role !== "owner");

  function select(wsId) {
    if (wsId !== currentId) switchWorkspace(wsId);
    setIsOpen(false);
  }

  function openSettings() {
    setIsOpen(false);
    setBusinessProfileOpen(true);
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
        {currentRole !== "owner" && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 capitalize ml-0.5">
            {currentRole}
          </span>
        )}
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
          <div className="max-h-80 overflow-y-auto py-1 space-y-3">
            {businesses.length > 0 && (
              <Section title="My Businesses">
                {businesses.map((ws) => (
                  <WorkspaceRow
                    key={ws.id || ws._id}
                    ws={ws}
                    detail={ws.businessType}
                    isActive={(ws.id || ws._id) === currentId}
                    onSelect={select}
                    onSettings={openSettings}
                  />
                ))}
              </Section>
            )}
            {teams.length > 0 && (
              <Section title="My Teams">
                {teams.map((ws) => (
                  <WorkspaceRow
                    key={ws.id || ws._id}
                    ws={ws}
                    detail={[ws.ownerName && `${ws.ownerName}'s`, capitalise(ws.role)].filter(Boolean).join(" · ")}
                    isActive={(ws.id || ws._id) === currentId}
                    onSelect={select}
                    onSettings={openSettings}
                  />
                ))}
              </Section>
            )}
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
              <span>New business</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const capitalise = (word = "") => word.charAt(0).toUpperCase() + word.slice(1);

function Section({ title, children }) {
  return (
    <div>
      <p className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** One business in the menu. The gear shows on the active one, if the user may edit its settings. */
function WorkspaceRow({ ws, detail, isActive, onSelect, onSettings }) {
  const wsId = ws.id || ws._id;
  const canEdit = (ws.permissions || []).includes("profile.update");

  return (
    <div
      className={`flex items-center rounded-lg text-xs transition ${
        isActive ? "bg-indigo-600/20 text-indigo-200 border border-indigo-500/30" : "text-slate-300 hover:bg-slate-900"
      }`}
    >
      <button
        onClick={() => onSelect(wsId)}
        className="flex-1 min-w-0 flex items-center justify-between pl-2.5 pr-1 py-2 text-left"
      >
        <div className="min-w-0">
          <div className="font-medium truncate text-slate-100">{ws.name || "Untitled business"}</div>
          {detail && <div className="text-[10px] text-slate-400 truncate">{detail}</div>}
        </div>
        <span
          className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ml-2 ${
            isActive ? "text-emerald-300" : "text-red-300"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-red-500"}`} />
          {isActive ? "Active" : "Inactive"}
        </span>
      </button>
      {isActive && canEdit ? (
        <button
          type="button"
          onClick={onSettings}
          title={`${ws.name || "Business"} settings`}
          aria-label={`${ws.name || "Business"} settings`}
          className="shrink-0 p-2 mr-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <GearIcon className="w-3.5 h-3.5" />
        </button>
      ) : (
        // Same width as the gear, so the statuses line up.
        <span className="shrink-0 w-[30px] mr-1" aria-hidden="true" />
      )}
    </div>
  );
}
