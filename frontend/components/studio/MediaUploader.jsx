"use client";

import React from "react";
import { Card, CardBody } from "../ui/Card";
import { ImageIcon, CloseIcon } from "../Icons";
import { IconButton } from "../ui/Button";
import { cn } from "../../lib/cn";

export const MAX_MEDIA = 4;

export function isVideoUrl(url) {
  return url?.startsWith("data:video");
}

export function MediaUploader({ mediaUrls, uploading, onFilesSelected, onRemove }) {
  const full = mediaUrls.length >= MAX_MEDIA;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span id="media-label" className="font-mono text-label uppercase text-ink-2">
          Photos or videos
        </span>
        <span className="text-micro text-ink-3" aria-live="polite">
          {mediaUrls.length}/{MAX_MEDIA} attached
        </span>
      </div>

      {mediaUrls.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2 mb-2" aria-label="Attached media">
          {mediaUrls.map((url, i) => (
            <li
              key={`${i}-${url.slice(0, 24)}`}
              className="relative w-16 h-16 rounded-md overflow-hidden bg-canvas border border-line shrink-0"
            >
              {isVideoUrl(url) ? (
                <video src={url} className="w-full h-full object-cover" muted aria-label={`Video attachment ${i + 1}`} />
              ) : (
                <img src={url} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" />
              )}
              <IconButton
                label={`Remove attachment ${i + 1}`}
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 !p-1 rounded bg-overlay/80 text-white hover:bg-danger"
              >
                <CloseIcon className="w-3 h-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {!full ? (
        <label
          htmlFor="studio-media-input"
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 py-6 rounded-md cursor-pointer transition",
            "bg-canvas border border-dashed border-line-strong",
            "text-ink-2 hover:text-brand-600 hover:border-brand-500/60"
          )}
        >
          <ImageIcon className="w-5 h-5" aria-hidden="true" />
          <span className="text-body-sm font-semibold">
            {uploading ? "Uploading…" : mediaUrls.length > 0 ? "Add another image or video" : "Click to upload an image or video"}
          </span>
          <span className="text-micro text-ink-3">JPG, PNG, MP4 up to 25MB each, {MAX_MEDIA} max</span>
          <input
            id="studio-media-input"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onFilesSelected}
            disabled={uploading}
            className="sr-only"
            aria-labelledby="media-label"
          />
        </label>
      ) : (
        <p className="text-micro text-ink-3 text-center py-1">Maximum of {MAX_MEDIA} files reached</p>
      )}
    </div>
  );
}

export function MediaUploaderCard(props) {
  return (
    <Card>
      <CardBody>
        <MediaUploader {...props} />
      </CardBody>
    </Card>
  );
}
