"use client";

import React, { useId, useRef } from "react";
import { cn } from "../../lib/cn";

/**
 * Accessible tabs — template language: segmented control on paper,
 * active tab is a white card with forest text + subtle shadow.
 * Roving tabindex, arrow-key navigation, aria wiring.
 */
export function Tabs({ tabs, activeId, onChange, className, label = "Tabs" }) {
  const baseId = useId();
  const tabRefs = useRef({});

  function onKeyDown(e, index) {
    let next = null;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    onChange(tab.id);
    tabRefs.current[tab.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-[10px] bg-card-muted border border-line",
        className
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[tab.id] = el)}
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "px-3.5 py-1.5 rounded-md text-body-sm font-semibold transition-all duration-200 whitespace-nowrap",
              selected
                ? "bg-card text-brand-700 shadow-1 border border-line"
                : "text-ink-2 hover:text-ink border border-transparent"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, labelledBy, active, children, className }) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
