"use client";

import React from "react";
import { Card, CardHeader, CardBody } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { IconButton } from "../ui/Button";
import { TrashIcon, LayersIcon } from "../Icons";
import { StatusChip } from "../ui/Badge";
import { cn } from "../../lib/cn";

export function DraftList({ drafts, activeDraftId, onSelect, onDelete }) {
  return (
    <Card>
      <CardHeader eyebrow="Library" title={`Saved Drafts (${drafts.length})`} />
      <CardBody className="pt-0">
        {drafts.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title="No drafts yet"
            description="Your saved drafts will appear here. Start writing above — drafts save with one click."
            className="py-8"
          />
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto" aria-label="Saved drafts">
            {drafts.map((d) => {
              const active = activeDraftId === d._id;
              return (
                <li key={d._id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(d)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(d);
                      }
                    }}
                    aria-label={`Open draft: ${d.title}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "p-3 rounded-[10px] border text-body-sm cursor-pointer transition-all duration-200 flex items-center justify-between gap-2",
                      active
                        ? "bg-brand-50 border-brand-500/50 text-ink shadow-1"
                        : "bg-card border-line text-ink-2 hover:border-line-strong hover:-translate-y-px"
                    )}
                  >
                    <div className="truncate pr-2 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        <span className="truncate">{d.title}</span>
                        <StatusChip status={d.status || "draft"} />
                      </div>
                      <div className="text-caption text-ink-3 truncate mt-0.5">{d.body}</div>
                    </div>
                    <IconButton
                      label={`Delete draft ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(d._id);
                      }}
                      className="shrink-0 hover:text-danger"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
