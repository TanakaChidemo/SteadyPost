"use client";

import React, { useState, useEffect, useId } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { SparklesIcon, InstagramIcon, FacebookIcon } from "./Icons";
import { Modal, ModalHeader } from "./ui/Modal";
import { Field, Textarea, Select } from "./ui/Field";
import { Button } from "./ui/Button";
import { Tabs } from "./ui/Tabs";
import { Badge } from "./ui/Badge";
import { cn } from "../lib/cn";

const TABS = [
  { id: "caption", label: "Generate Caption" },
  { id: "hashtags", label: "Smart Hashtags" },
  { id: "repurpose", label: "Repurposer" },
];

export function AIModal({ onInsert, initialContent }) {
  const { isAiModalOpen, setAiModalOpen, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState("caption");
  const titleId = useId();

  // Caption generator state
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("casual");
  const [generatedCaption, setGeneratedCaption] = useState("");

  // Hashtag state
  const [tagContent, setTagContent] = useState("");
  const [generatedTags, setGeneratedTags] = useState([]);

  // Repurpose state
  const [sourceContent, setSourceContent] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("instagram");
  const [repurposedOutputs, setRepurposedOutputs] = useState({});

  const [loading, setLoading] = useState(false);

  // Carry whatever's already in Post Copy into the modal on open, so
  // "Optimize with AI" builds on what's already written instead of asking
  // "what is this about" as if starting from nothing.
  useEffect(() => {
    if (isAiModalOpen && initialContent) {
      setTopic(initialContent);
      setTagContent(initialContent);
      setSourceContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiModalOpen]);

  async function handleGenerateCaption() {
    if (!topic.trim()) return addToast("error", "Please enter a topic or concept");
    setLoading(true);
    try {
      const res = await api.ai.generateCaption({ topic, platform, tone });
      setGeneratedCaption(res.caption);
      addToast("success", "AI caption generated!");
    } catch (err) {
      addToast("error", err.message || "AI caption generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateHashtags() {
    if (!tagContent.trim()) return addToast("error", "Please enter draft text to analyze");
    setLoading(true);
    try {
      const res = await api.ai.suggestHashtags({ content: tagContent, platform, maxTags: 10 });
      setGeneratedTags(res.hashtags || []);
      addToast("success", "Smart hashtags generated!");
    } catch (err) {
      addToast("error", err.message || "Hashtag generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRepurpose() {
    if (!sourceContent.trim()) return addToast("error", "Please enter original content");
    setLoading(true);
    try {
      const targets = ["instagram", "facebook"].filter((p) => p !== sourcePlatform);
      const res = await api.ai.repurpose({
        content: sourceContent,
        sourcePlatform,
        targetPlatforms: targets,
      });
      setRepurposedOutputs(res.repurposed || {});
      addToast("success", "Repurposed for all social channels!");
    } catch (err) {
      addToast("error", err.message || "Repurposing failed");
    } finally {
      setLoading(false);
    }
  }

  function handleApply(text) {
    if (onInsert) {
      onInsert(text);
    }
    setAiModalOpen(false);
    addToast("success", "Inserted into editor!");
  }

  return (
    <Modal open={isAiModalOpen} onClose={() => setAiModalOpen(false)} labelledBy={titleId} size="lg">
      <ModalHeader
        id={titleId}
        title="AI Content Assistant"
        subtitle="Generate platform-tailored copy, high-ranking hashtags & omni-channel adaptations"
        onClose={() => setAiModalOpen(false)}
      />

      <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-ai-100 border border-ai-500/25">
        <span className="w-10 h-10 rounded-[10px] bg-ai-500 flex items-center justify-center shrink-0">
          <SparklesIcon className="w-5 h-5 text-white" aria-hidden="true" />
        </span>
        <p className="text-body-sm text-ink-2">
          Outputs are drafts — review before publishing. Nothing is posted automatically.
        </p>
      </div>

      <Tabs
        label="AI tools"
        tabs={TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        className="w-full grid grid-cols-3 mb-5"
      />

      {activeTab === "caption" && (
        <div className="space-y-4">
          <Field label={topic ? "Your post (edit to redirect the AI)" : "What is your post about?"}>
            <Textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Announcing our 2026 AI Product Roadmap with automated scheduler & instant analytics…"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Target Platform">
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="instagram">Instagram (Visual & Engaging)</option>
                <option value="facebook">Facebook (Conversational & Community)</option>
              </Select>
            </Field>
            <Field label="Tone of Voice">
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="casual">Casual & Approachable</option>
                <option value="professional">Professional & Authoritative</option>
                <option value="enthusiastic">Enthusiastic & High Energy</option>
                <option value="witty">Witty & Humorous</option>
                <option value="educational">Educational & Actionable</option>
              </Select>
            </Field>
          </div>

          <Button variant="ai" onClick={handleGenerateCaption} disabled={loading} loading={loading} className="w-full">
            {!loading && <SparklesIcon className="w-4 h-4" aria-hidden="true" />}
            {loading ? "Generating Copy…" : "Generate AI Caption"}
          </Button>

          {generatedCaption && (
            <div className="p-4 rounded-[10px] bg-ai-100 border border-ai-500/30 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono text-label uppercase text-ink-2">Generated AI output</span>
                <Button size="sm" variant="ai" onClick={() => handleApply(generatedCaption)}>
                  Apply to Post Draft
                </Button>
              </div>
              <p className="text-body-sm text-ink whitespace-pre-wrap leading-relaxed">{generatedCaption}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "hashtags" && (
        <div className="space-y-4">
          <Field label="Post Text or Keywords">
            <Textarea
              rows={3}
              value={tagContent}
              onChange={(e) => setTagContent(e.target.value)}
              placeholder="Paste your post body or core keywords here to extract relevant hashtags…"
            />
          </Field>

          <Button variant="ai" onClick={handleGenerateHashtags} disabled={loading} loading={loading} className="w-full">
            {!loading && <SparklesIcon className="w-4 h-4" aria-hidden="true" />}
            {loading ? "Extracting Hashtags…" : "Generate Smart Hashtags"}
          </Button>

          {generatedTags.length > 0 && (
            <div className="p-4 rounded-[10px] bg-ai-100 border border-ai-500/30 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono text-label uppercase text-ink-2">
                  Suggested hashtags ({generatedTags.length})
                </span>
                <Button size="sm" variant="ai" onClick={() => handleApply(`\n\n${generatedTags.join("")}`)}>
                  Append All to Draft
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {generatedTags.map((tag, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApply(` ${tag}`)}
                    title="Click to insert"
                    aria-label={`Insert hashtag ${tag}`}
                    className="px-2.5 py-1 rounded-full bg-card border border-ai-500/40 text-ai-600 text-caption font-semibold hover:bg-ai-500/15 transition"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "repurpose" && (
        <div className="space-y-4">
          <Field label="This post was originally written for">
            <div className="flex gap-2" role="group" aria-label="Source platform">
              {["instagram", "facebook"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSourcePlatform(p)}
                  aria-pressed={sourcePlatform === p}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-body-sm font-semibold capitalize transition",
                    sourcePlatform === p
                      ? "border-brand-500/60 bg-brand-500/10 text-ink"
                      : "border-line bg-card text-ink-2 hover:border-line-strong"
                  )}
                >
                  {p === "instagram" ? (
                    <InstagramIcon className="w-3.5 h-3.5 text-social-instagram" aria-hidden="true" />
                  ) : (
                    <FacebookIcon className="w-3.5 h-3.5 text-social-facebook" aria-hidden="true" />
                  )}
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Original Post Content">
            <Textarea
              rows={3}
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
              placeholder="Paste the source post you want to adapt for the other platform…"
            />
          </Field>

          <Button variant="ai" onClick={handleRepurpose} disabled={loading} loading={loading} className="w-full">
            {!loading && <SparklesIcon className="w-4 h-4" aria-hidden="true" />}
            {loading ? "Adapting Content…" : "Repurpose for the Other Platform"}
          </Button>

          {Object.keys(repurposedOutputs).length > 0 && (
            <div className="space-y-3">
              {Object.entries(repurposedOutputs).map(([plt, text]) => (
                <div key={plt} className="p-3.5 rounded-md bg-canvas border border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="bg-card text-ink-2 border-line-strong">
                      {plt === "instagram" ? (
                        <InstagramIcon className="w-3.5 h-3.5 text-social-instagram" aria-hidden="true" />
                      ) : (
                        <FacebookIcon className="w-3.5 h-3.5 text-social-facebook" aria-hidden="true" />
                      )}
                      <span className="capitalize">{plt}</span>
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => handleApply(text)}>
                      Use this
                    </Button>
                  </div>
                  <p className="text-body-sm text-ink-2 whitespace-pre-wrap">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
