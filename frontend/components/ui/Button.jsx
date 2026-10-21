"use client";

import React from "react";
import { SpinnerIcon } from "../Icons";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary: "btn-brand",
  secondary:
    "bg-card text-ink border border-line shadow-1 hover:bg-card-muted hover:-translate-y-px",
  ghost: "text-ink-2 hover:bg-brand-50 hover:text-brand-700",
  danger: "bg-danger-bg text-danger border border-danger/25 hover:brightness-95",
  ai: "bg-ai-500 text-white border border-ai-500 shadow-1 hover:bg-ai-600 hover:-translate-y-px",
};

const SIZES = {
  sm: "px-3 py-1.5 text-caption rounded-md gap-1.5",
  md: "px-4 py-2 text-body-sm font-semibold rounded-[10px] gap-2",
  lg: "px-5 py-2.5 text-body font-semibold rounded-[10px] gap-2",
  icon: "p-2 rounded-[10px]",
};

/**
 * Primary action button — solid forest green, radius 10, restrained
 * hover lift (template micro-interaction language).
 * Icon-only usage MUST pass aria-label (WCAG 2.1 AA).
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold",
        "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        "active:translate-y-0",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <SpinnerIcon className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Icon-only button with mandatory accessible name. */
export function IconButton({ label, className, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center p-2 rounded-[10px]",
        "text-ink-2 hover:text-brand-700 hover:bg-brand-50 border border-transparent",
        "transition-colors duration-200",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
