"use client";

import React from "react";
import { cn } from "../../lib/cn";

/*
 * Card — template language: 1px #e2dfda border, white bg,
 * ultra-subtle warm shadow, radius 14. Hover lifts on interactive cards.
 */
export function Card({ className, hover = false, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card border border-line shadow-1",
        hover &&
          "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, eyebrow, action, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pt-6 pb-4", className)}>
      <div>
        {eyebrow && (
          <p className="font-mono text-label uppercase text-brand-600 mb-1.5">{eyebrow}</p>
        )}
        {title && <h2 className="font-serif text-h2 text-ink">{title}</h2>}
        {subtitle && <p className="text-body-sm text-ink-2 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn("px-6 pb-6", className)}>{children}</div>;
}

/** Page-level header: mono eyebrow, serif title, description, actions. */
export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6",
        "sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div>
        {eyebrow && (
          <p className="font-mono text-label uppercase text-brand-600 mb-2">{eyebrow}</p>
        )}
        <h1 className="font-serif text-h1 text-ink">{title}</h1>
        {description && (
          <p className="text-body text-ink-2 mt-2 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

/**
 * KPI stat card — template widget language: 34px tinted icon tile,
 * 26px DM Mono numeral, mono trend chip.
 */
export function StatCard({ label, value, hint, trend, icon, iconTone }) {
  return (
    <Card hover className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0",
            iconTone || "bg-brand-50 text-brand-600"
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        {trend}
      </div>
      <p className="font-mono text-label uppercase text-ink-2 mt-4">{label}</p>
      <p className="font-mono text-[26px] leading-8 text-ink mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-micro text-ink-3 mt-1.5">{hint}</p>}
    </Card>
  );
}
