"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";
import { CloseIcon } from "../Icons";

/**
 * Accessible modal: focus-trapped, ESC to close, scrim click to close,
 * labelled via titleId. Renders nothing when closed.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  size = "md",
  children,
  className,
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;

    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll(
              'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];

    // Move focus into the dialog on open.
    const first = focusables()[0];
    (first || panel)?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-overlay/60 backdrop-blur-[2px] animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-card border border-line rounded-t-xl sm:rounded-xl",
          "shadow-modal max-h-[92dvh] overflow-y-auto animate-scale-in",
          "p-6 sm:p-8",
          sizes[size],
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ModalHeader({ id, title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 id={id} className="font-serif text-h2 text-ink">
          {title}
        </h2>
        {subtitle && <p className="text-body-sm text-ink-2 mt-1">{subtitle}</p>}
      </div>
      {onClose && (
        <IconButton label="Close dialog" onClick={onClose} className="-mr-2 -mt-2 shrink-0">
          <CloseIcon className="w-5 h-5" />
        </IconButton>
      )}
    </div>
  );
}

/** Right-side drawer for mobile-first flows; same a11y contract as Modal. */
export function Drawer({ open, onClose, labelledBy, children, className }) {
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    panelRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-overlay/70 animate-fade-in" aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-sm bg-surface border-l border-line",
          "shadow-modal overflow-y-auto p-5 animate-fade-in",
          className
        )}
      >
        {children}
      </aside>
    </div>,
    document.body
  );
}
