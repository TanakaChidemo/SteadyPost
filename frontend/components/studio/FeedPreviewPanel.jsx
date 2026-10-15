"use client";

import React from "react";
import { Card, CardBody } from "../ui/Card";
import { Tabs } from "../ui/Tabs";
import { getFeedPreview, getFeedLabel } from "../feed";

/**
 * Live feed preview panel. Renders whatever channels are registered in
 * the feed registry — adding GBP (#13) needs no changes here.
 */
export function FeedPreviewPanel({
  channels,
  activeChannel,
  onChannelChange,
  accountName,
  body,
  mediaUrls,
  mediaIndex,
  onMediaIndexChange,
}) {
  const entry = getFeedPreview(activeChannel);
  const Preview = entry?.Component;

  return (
    <Card>
      <CardBody className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-label uppercase text-ink-3">
            Live feed preview
          </span>
          {channels.length > 0 && (
            <Tabs
              label="Preview channel"
              tabs={channels.map((c) => ({ id: c, label: getFeedLabel(c) }))}
              activeId={activeChannel}
              onChange={onChannelChange}
            />
          )}
        </div>

        <div className="rounded-md bg-canvas border border-line p-4">
          {Preview ? (
            <Preview
              accountName={accountName}
              body={body}
              mediaUrls={mediaUrls}
              mediaIndex={mediaIndex}
              onMediaIndexChange={onMediaIndexChange}
            />
          ) : (
            <p className="text-body-sm text-ink-3 text-center py-8">
              Select a publish destination to preview the post.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
