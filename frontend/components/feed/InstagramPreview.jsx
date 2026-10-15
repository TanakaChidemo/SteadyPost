"use client";

import React from "react";
import { LayersIcon, HeartIcon, CommentIcon, ShareIcon, BookmarkIcon } from "../Icons";
import { cn } from "../../lib/cn";

/**
 * Instagram feed-post mock-up. Pure presentational component —
 * new channels (#13 GBP) slot in beside it via feedRegistry.
 */
export function InstagramPreview({
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-0.5" aria-hidden="true">
            <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-micro font-bold text-ink">
              {initials}
            </div>
          </div>
          <span className="text-caption font-bold text-ink">
            {accountName || "Connect an Instagram account"}
          </span>
        </div>
        <span className="text-ink-3 font-bold tracking-widest" aria-hidden="true">···</span>
      </div>

      {activeUrl ? (
        <div className="relative rounded-[10px] overflow-hidden border border-line max-h-64 bg-card-muted">
          {isVideo(activeUrl) ? (
            <video src={activeUrl} controls className="w-full h-full object-cover" />
          ) : (
            <img src={activeUrl} alt="Instagram post media" className="w-full h-full object-cover" />
          )}
          {mediaUrls.length > 1 && (
            <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-overlay/80 text-micro text-white">
              <LayersIcon className="w-3 h-3" aria-hidden="true" />
              {mediaIndex + 1}/{mediaUrls.length}
            </span>
          )}
        </div>
      ) : (
        <div className="h-44 rounded-[10px] bg-card-muted border border-dashed border-line-strong flex items-center justify-center text-caption text-ink-3">
          Upload media for the Instagram post
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-ink" aria-hidden="true">
          <div className="flex items-center gap-4">
            <HeartIcon className="w-5 h-5" />
            <CommentIcon className="w-5 h-5" />
            <ShareIcon className="w-5 h-5" />
          </div>
          <BookmarkIcon className="w-5 h-5" />
        </div>
        <p className="text-body-sm text-ink-2 line-clamp-3">
          <strong className="text-ink mr-1.5">{accountName || "your_account"}</strong>
          {body || "Your Instagram caption and hashtags…"}
        </p>
      </div>
    </div>
  );
}
