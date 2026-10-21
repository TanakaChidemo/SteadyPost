"use client";

import React from "react";
import { cn } from "../../lib/cn";

// Content lifecycle statuses — template chip language: DM Mono uppercase,
// tinted bg + saturated text + ~0.2-alpha border.
const STATUS_STYLES = {
  draft: "bg-card-muted text-ink-2 border-line-strong",
  pending: "bg-warning-bg text-warning border-warning/30",
  "pending approval": "bg-warning-bg text-warning border-warning/30",
  approved: "bg-info-bg text-info border-info/30",
  scheduled: "bg-brand-50 text-brand-700 border-brand-500/30",
  published: "bg-success-bg text-success border-success/30",
  failed: "bg-danger-bg text-danger border-danger/30",
  connected: "bg-success-bg text-success border-success/30",
  inactive: "bg-card-muted text-ink-3 border-line",
  live: "bg-success-bg text-success border-success/30",
  sandbox: "bg-warning-bg text-warning border-warning/30",
};

export function Badge({ children, className, tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border",
        "font-mono text-micro uppercase tracking-[0.04em] whitespace-nowrap",
        tone || "bg-card-muted text-ink-2 border-line",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Status chip with a dot; unknown statuses fall back to neutral. */
export function StatusChip({ status, className }) {
  const key = String(status || "").toLowerCase();
  const style = STATUS_STYLES[key] || STATUS_STYLES.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
        "font-mono text-micro uppercase tracking-[0.04em] whitespace-nowrap",
        style,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}
