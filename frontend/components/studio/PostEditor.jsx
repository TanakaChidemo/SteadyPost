"use client";

import React from "react";
import { Card, CardBody } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import { SparklesIcon } from "../Icons";
import { MediaUploader } from "./MediaUploader";

export function PostEditor({
  title,
  onTitleChange,
  body,
  onBodyChange,
  charLimit,
  mediaProps,
  onSaveDraft,
  saving,
  publishing,
  onAiAssist,
}) {
  const overLimit = charLimit && body.length > charLimit;
  return (
    <Card>
      <CardBody className="space-y-4 pt-5">
        <Field label="Campaign Title">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Q3 AI Platform Launch"
            maxLength={120}
          />
        </Field>

        <Field
          label="Post Copy"
          hint={charLimit ? `${body.length} / ${charLimit} characters` : `${body.length} characters`}
          error={overLimit ? `Over the ${charLimit}-character limit for this platform` : undefined}
        >
          <Textarea
            rows={7}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Write your post here or use AI Studio to generate captions, hashtags, and variations…"
          />
        </Field>

        <MediaUploader {...mediaProps} />

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveDraft}
            disabled={saving || publishing}
            loading={saving}
          >
            {saving ? "Saving…" : "Save as Draft"}
          </Button>
          <button
            type="button"
            onClick={onAiAssist}
            className="text-body-sm text-brand-600 hover:underline font-semibold inline-flex items-center gap-1.5"
          >
            <SparklesIcon className="w-4 h-4" aria-hidden="true" />
            Optimize with AI
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
