"use client";

import React from "react";
import { cn } from "../../lib/cn";
import { InboxIcon } from "../Icons";

/**
 * First-run / empty state — template empty-state language: serif 22px
 * title, quiet description, single next action.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
  secondaryAction,
  className,
}) {
  const Icon = icon || InboxIcon;
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center px-6 py-14 rounded-lg",
        "bg-card border border-dashed border-line-strong",
        className
      )}
    >
      <div className="w-12 h-12 rounded-[14px] bg-brand-50 border border-brand-500/20 flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-brand-600" aria-hidden="true" />
      </div>
      {eyebrow && (
        <p className="font-mono text-label uppercase text-brand-600 mb-2">{eyebrow}</p>
      )}
      <h2 className="font-serif text-h2 text-ink">{title}</h2>
      {description && (
        <p className="text-body-sm text-ink-2 mt-2 max-w-sm leading-relaxed">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-6 flex-wrap justify-center">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
