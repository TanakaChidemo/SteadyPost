"use client";

import React, { useId } from "react";
import { cn } from "../../lib/cn";

/*
 * Form inputs — template language: paper-tinted bg (#f7f6f3), 1px border,
 * radius 10, focus → white bg + 3px #e8f0ec ring + forest border.
 */
const inputBase =
  "w-full rounded-[10px] bg-canvas border border-line text-body text-ink placeholder:text-ink-3 " +
  "px-3.5 py-2 transition-all duration-200 focus:outline-none " +
  "focus:bg-card focus:border-brand-500 focus:ring-[3px] focus:ring-brand-50 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export function Field({ label, hint, error, htmlFor, children, className }) {
  const id = useId();
  const fieldId = htmlFor || id;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block font-mono text-label uppercase text-ink-2"
        >
          {label}
        </label>
      )}
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { id: fieldId }) : child
      )}
      {error ? (
        <p className="text-caption text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(inputBase, "leading-relaxed resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(inputBase, "pr-8 cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}
