"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import { CheckIcon, UsersIcon, InstagramIcon, FacebookIcon } from "../Icons";
import { getFeedLabel } from "../feed";
import { cn } from "../../lib/cn";

const PLATFORM_ICONS = { instagram: InstagramIcon, facebook: FacebookIcon };

/**
 * One toggle per connected account (a user can own several Pages per
 * platform). At least one account must stay selected.
 */
export function DestinationPicker({ accounts, selectedIds, onToggle }) {
  return (
    <Card>
      <CardHeader eyebrow="Destinations" title="Publish Destinations" subtitle="Choose which accounts this post goes to." />
      <CardBody className="pt-0">
        {accounts.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No channels connected"
            description="Connect an Instagram or Facebook account to choose publish destinations."
            action={
              <Link href="/dashboard/accounts">
                <Button size="sm">Connect a channel</Button>
              </Link>
            }
            className="py-8"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="group" aria-label="Publish destinations">
            {accounts.map((account) => {
              const Icon = PLATFORM_ICONS[account.platform] || FacebookIcon;
              const selected = selectedIds.includes(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onToggle(account.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-[10px] border text-body-sm font-semibold text-left transition-all duration-200",
                    selected
                      ? "border-brand-500/50 bg-brand-50 text-ink shadow-1"
                      : "border-line bg-card text-ink-2 hover:border-line-strong hover:text-ink"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0 text-ink-2" aria-hidden="true" />
                  <span className="truncate flex-1">
                    {account.displayName}
                    <span className="block font-mono text-micro uppercase tracking-[0.04em] font-normal text-ink-3">
                      {getFeedLabel(account.platform)}
                    </span>
                  </span>
                  {selected && <CheckIcon className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
