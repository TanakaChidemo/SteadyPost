"use client";

import React from "react";
import { cn } from "../../lib/cn";

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md bg-card-muted border border-line", className)}
    />
  );
}

/** Loading placeholder for a grid of cards. */
export function CardGridSkeleton({ count = 4, className }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 rounded-lg bg-card border border-line space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
