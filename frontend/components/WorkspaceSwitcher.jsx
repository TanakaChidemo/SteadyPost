"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store";
import { ChevronDownIcon, CheckIcon } from "./Icons";
import { cn } from "../lib/cn";

/**
 * Workspace switcher. Card #02 (multi-venture support) makes this list
 * real; until then it renders the single default workspace and doubles
 * as the place a "New workspace" action will live.
 */
export function WorkspaceSwitcher({ compact = false }) {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Workspace: ${active?.name}. Change workspace`}
        className={cn(
          "flex items-center gap-2 rounded-[10px] border border-line bg-card shadow-1",
          "hover:border-line-strong hover:-translate-y-px transition-all duration-200 min-w-0",
          compact ? "px-2.5 py-1.5" : "px-3 py-2 w-full"
        )}
      >
        <span
          aria-hidden="true"
          className="w-7 h-7 rounded-md bg-brand-500 border border-brand-600 flex items-center justify-center text-white text-caption font-bold shrink-0"
        >
          {active?.name?.charAt(0)?.toUpperCase() || "W"}
        </span>
        {!compact && (
          <span className="text-body-sm font-semibold text-ink truncate flex-1 text-left">
            {active?.name}
          </span>
        )}
        <ChevronDownIcon
          className={cn("w-4 h-4 text-ink-3 transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className={cn(
            "absolute z-40 mt-1.5 rounded-lg bg-card border border-line shadow-3",
            "p-1.5 animate-scale-in",
            compact ? "right-0 w-56" : "left-0 w-full min-w-56"
          )}
        >
          {workspaces.map((w) => {
            const selected = w.id === activeWorkspaceId;
            return (
              <button
                key={w.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setActiveWorkspaceId(w.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition",
                  selected ? "bg-brand-50" : "hover:bg-card-muted"
                )}
              >
                <span
                  aria-hidden="true"
                  className="w-7 h-7 rounded-md bg-brand-500 border border-brand-600 flex items-center justify-center text-white text-caption font-bold shrink-0"
                >
                  {w.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-body-sm font-medium text-ink truncate flex-1">{w.name}</span>
                {selected && <CheckIcon className="w-4 h-4 text-brand-600 shrink-0" />}
              </button>
            );
          })}
          <p className="px-2.5 pt-2 pb-1 text-micro text-ink-3">
            Multiple workspaces are coming soon.
          </p>
        </div>
      )}
    </div>
  );
}
