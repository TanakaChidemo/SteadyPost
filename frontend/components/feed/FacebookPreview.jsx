"use client";

import React from "react";
import { LayersIcon, HeartIcon, CommentIcon, ShareIcon } from "../Icons";
import { cn } from "../../lib/cn";

/** Facebook page-post mock-up. See InstagramPreview for the contract. */
export function FacebookPreview({
  accountName,
  body,
  mediaUrls = [],
  mediaIndex = 0,
  onMediaIndexChange,
}) {
  const activeUrl = mediaUrls[mediaIndex] ?? mediaUrls[0];
  const isVideo = (url) => url?.startsWith("data:video");
  const initials = (accountName || "SP").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className="w-9 h-9 rounded-full bg-social-facebook flex items-center justify-center text-white text-caption font-bold"
        >
          {initials}
        </div>
        <div>
          <div className="text-caption font-bold text-ink">
            {accountName || "Connect a Facebook Page"}
          </div>
          <span className="font-mono text-micro uppercase tracking-[0.04em] text-ink-3">Public · Just now</span>
        </div>
      </div>

      <p className="text-body-sm text-ink-2 whitespace-pre-wrap leading-relaxed">
        {body || "Your Facebook post copy…"}
      </p>

      {activeUrl && (
        <div className="relative rounded-[10px] overflow-hidden border border-line max-h-56 bg-card-muted">
          {isVideo(activeUrl) ? (
            <video src={activeUrl} controls className="w-full h-full object-cover" />
          ) : (
            <img src={activeUrl} alt="Facebook post media" className="w-full h-full object-cover" />
          )}
          {mediaUrls.length > 1 && (
            <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-overlay/80 text-micro text-white">
              <LayersIcon className="w-3 h-3" aria-hidden="true" />
              {mediaIndex + 1}/{mediaUrls.length}
            </span>
          )}
        </div>
      )}

      {mediaUrls.length > 1 && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Choose preview media">
          {mediaUrls.map((_, i) => (
            <button
              key={i}
              onClick={() => onMediaIndexChange?.(i)}
              aria-label={`Show media ${i + 1}`}
              aria-pressed={i === mediaIndex}
              className={cn(
                "w-2 h-2 rounded-full transition",
                i === mediaIndex ? "bg-brand-500" : "bg-line-strong hover:bg-ink-3"
              )}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-caption text-ink-3 pt-2.5 border-t border-line-subtle" aria-hidden="true">
        <span className="flex items-center gap-1.5"><HeartIcon className="w-3.5 h-3.5" /> 86</span>
        <span className="flex items-center gap-1.5"><CommentIcon className="w-3.5 h-3.5" /> 14 comments</span>
        <span className="flex items-center gap-1.5"><ShareIcon className="w-3.5 h-3.5" /> Share</span>
      </div>
    </div>
  );
}
