"use client";

import React from "react";
import { PageHeader } from "../ui/Card";
import { Button } from "../ui/Button";
import { SparklesIcon, PlusIcon, SendIcon } from "../Icons";

export function StudioHeader({ onNewDraft, onAiAssist, onPublish, publishing, publishStage, busy }) {
  return (
    <PageHeader
      title="Content Studio"
      eyebrow="Studio"
      description="Craft, preview, repurpose with AI, and publish to all networks in sync."
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={onNewDraft}>
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
            New Draft
          </Button>
          <Button variant="ai" size="sm" onClick={onAiAssist}>
            <SparklesIcon className="w-4 h-4" aria-hidden="true" />
            AI Assist
          </Button>
          <Button size="sm" onClick={onPublish} disabled={busy} loading={publishing}>
            {!publishing && <SendIcon className="w-4 h-4" aria-hidden="true" />}
            {publishing ? publishStage || "Publishing…" : "Publish Now"}
          </Button>
        </>
      }
    />
  );
}
