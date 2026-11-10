"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  TwitterIcon,
  LinkedInIcon,
  GoogleIcon,
  CheckIcon,
  RefreshIcon,
  SpinnerIcon,
} from "./Icons";

// Supported omnichannel targets matching backend publishing adapters (#10 & #13)
const AVAILABLE_CHANNELS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: InstagramIcon,
    maxChars: 2200,
    color: "text-pink-400 border-pink-500/40 bg-pink-500/10",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: FacebookIcon,
    maxChars: 5000,
    color: "text-indigo-400 border-indigo-500/40 bg-indigo-500/10",
  },
  {
    id: "twitter",
    label: "Twitter / X",
    icon: TwitterIcon,
    maxChars: 280,
    color: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: LinkedInIcon,
    maxChars: 3000,
    color: "text-blue-400 border-blue-500/40 bg-blue-500/10",
  },
  {
    id: "gbp",
    label: "Google Business",
    icon: GoogleIcon,
    maxChars: 1500,
    color: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  },
];

const MULTI_MODEL_PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: InstagramIcon },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
  { id: "twitter", label: "Twitter / X", icon: TwitterIcon },
  { id: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
  { id: "gbp", label: "GBP", icon: GoogleIcon },
];

// Single unified tone list matching the Business Profile
const UNIFIED_TONES = [
  { id: "professional", label: "Professional" },
  { id: "inspiring", label: "Inspiring" },
  { id: "tech-forward", label: "Tech-Forward" },
  { id: "casual", label: "Casual" },
  { id: "authoritative", label: "Authoritative" },
  { id: "bold", label: "Bold" },
  { id: "playful", label: "Playful" },
];

function GuardrailsAuditCard({ report, onReaudit, loading }) {
  if (!report && !loading) {
    if (!onReaudit) return null;
    return (
      <div className="pt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400 italic">Not audited yet</span>
        <button
          type="button"
          onClick={onReaudit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition"
        >
          <span>🛡️</span>
          <span>Check Brand Guardrails (F09)</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
        <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-indigo-400" />
        <span>Auditing variant against brand voice & safety guardrails...</span>
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">🛡️</span>
          <span className="font-bold text-white text-xs">Brand Guardrails & Voice Audit (F09)</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              report.passed
                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
            }`}
          >
            Score: {report.score}/100 — {report.passed ? "PASSED" : "ISSUES FLAGGED"}
          </span>
          {onReaudit && (
            <button
              onClick={onReaudit}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              Re-check
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
        <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Tone Match</span>
          <span className={report.tone?.passed ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
            {report.tone?.passed ? "✓ Matches Tone" : "✗ Tone Drift Detected"}
          </span>
          <span className="text-slate-400 block text-[10px]">
            Target: {report.tone?.targetTone?.join(", ") || "profile tone"}
          </span>
        </div>

        <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Banned Claims</span>
          <span className={report.bannedClaims?.passed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
            {report.bannedClaims?.passed ? "✓ Clear" : `✗ ${report.bannedClaims?.violations?.length} Violation(s)`}
          </span>
          <span className="text-slate-400 block text-[10px]">
            No unauthorized guarantees or policy violations
          </span>
        </div>

        <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Disclosures</span>
          <span className={report.disclosures?.passed ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
            {report.disclosures?.passed ? "✓ Clear" : "✗ Missing Disclosures"}
          </span>
          <span className="text-slate-400 block text-[10px]">
            FTC / affiliate disclosure enforcement
          </span>
        </div>
      </div>

      {report.violations?.length > 0 && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] space-y-1">
          <span className="font-bold block">Items Requiring Attention:</span>
          {report.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span>•</span>
              <span>{v.message || v.reason || v.phrase || "Policy violation"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-900 pt-1">
        <span>Approval remains mandatory even when guardrails pass.</span>
        <span className="text-indigo-400 font-medium">Safety Net Active</span>
      </div>
    </div>
  );
}

export function AIModal({ onInsert, initialContent, onDraftCreated }) {
  const { isAiModalOpen, setAiModalOpen, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState("write"); // write | multi_model | repurpose | hashtags

  // --- Tab 1: Write Posts State ---
  const [writeIdea, setWriteIdea] = useState("");
  const [writeChannels, setWriteChannels] = useState(["instagram", "facebook"]);
  const [writeTone, setWriteTone] = useState("professional");
  const [writeVariants, setWriteVariants] = useState([]);
  const [activeWriteChannel, setActiveWriteChannel] = useState("instagram");
  const [writeLoading, setWriteLoading] = useState(false);
  const [savingVariantChannel, setSavingVariantChannel] = useState(null);
  const [savedVariants, setSavedVariants] = useState({});
  const [suggestingTagsChannel, setSuggestingTagsChannel] = useState(null);
  const [writeGuardrails, setWriteGuardrails] = useState({});
  const [repurposeGuardrails, setRepurposeGuardrails] = useState({});
  const [auditingChannel, setAuditingChannel] = useState(null);

  // --- Tab 2: Multi-Model AI State ---
  const [modelTopic, setModelTopic] = useState("");
  const [modelPlatform, setModelPlatform] = useState("instagram");
  const [modelTone, setModelTone] = useState("professional");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelGuardrails, setModelGuardrails] = useState(null);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [savedCandidate, setSavedCandidate] = useState(false);

  async function auditVariant(variant, isRepurpose = false) {
    if (!variant?.content?.body) return;
    setAuditingChannel(variant.channel);
    try {
      const audit = await api.guardrails.checkDraft({
        content: variant.content.body,
        channel: variant.channel,
      });
      if (isRepurpose) {
        setRepurposeGuardrails((prev) => ({ ...prev, [variant.channel]: audit }));
      } else {
        setWriteGuardrails((prev) => ({ ...prev, [variant.channel]: audit }));
      }
    } catch (err) {
      addToast("error", err.message || "Guardrails audit failed");
    } finally {
      setAuditingChannel(null);
    }
  }

  // --- Tab 3: Reuse a Past Post State ---
  const [topPosts, setTopPosts] = useState([]);
  const [loadingTopPosts, setLoadingTopPosts] = useState(false);
  const [selectedTopPost, setSelectedTopPost] = useState(null);
  const [repurposeChannels, setRepurposeChannels] = useState(["instagram", "facebook"]);
  const [repurposeTone, setRepurposeTone] = useState("inspiring");
  const [repurposeVariants, setRepurposeVariants] = useState([]);
  const [activeRepurposeChannel, setActiveRepurposeChannel] = useState("instagram");
  const [repurposingLoading, setRepurposingLoading] = useState(false);
  const [savingRepurposeVariantChannel, setSavingRepurposeVariantChannel] = useState(null);
  const [savedRepurposeVariants, setSavedRepurposeVariants] = useState({});

  // --- Tab 4: Hashtags State ---
  const [tagContent, setTagContent] = useState("");
  const [generatedTags, setGeneratedTags] = useState([]);
  const [tagLoading, setTagLoading] = useState(false);

  // Shared copy state
  const [copiedKey, setCopiedKey] = useState(null);

  // Initialize from initial editor content
  useEffect(() => {
    if (isAiModalOpen && initialContent) {
      setWriteIdea(initialContent);
      setModelTopic(initialContent);
      setTagContent(initialContent);
    }
  }, [isAiModalOpen, initialContent]);

  // Load Business Profile tone default
  useEffect(() => {
    if (isAiModalOpen) {
      api.businessProfile
        .get()
        .then((profile) => {
          if (profile?.tone?.length) {
            const firstTone = String(profile.tone[0]).toLowerCase();
            const match = UNIFIED_TONES.find((t) => t.id === firstTone);
            if (match) {
              setWriteTone(match.id);
              setModelTone(match.id);
              setRepurposeTone(match.id);
            }
          }
        })
        .catch(() => {});
    }
  }, [isAiModalOpen]);

  // Fetch top published posts when opening the repurpose tab
  useEffect(() => {
    if (isAiModalOpen && activeTab === "repurpose") {
      loadTopPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiModalOpen, activeTab]);

  async function loadTopPosts() {
    setLoadingTopPosts(true);
    try {
      const res = await api.posts.getTopPerforming({ limit: 6 });
      setTopPosts(res.items || []);
      if (res.items?.length > 0 && !selectedTopPost) {
        setSelectedTopPost(res.items[0]);
      }
    } catch (err) {
      addToast("error", err.message || "Failed to load past posts");
    } finally {
      setLoadingTopPosts(false);
    }
  }

  // --- Channel Toggles ---
  function toggleWriteChannel(id) {
    if (writeChannels.includes(id)) {
      if (writeChannels.length === 1) return addToast("info", "Select at least one network");
      const next = writeChannels.filter((c) => c !== id);
      setWriteChannels(next);
      if (activeWriteChannel === id) setActiveWriteChannel(next[0]);
    } else {
      const next = [...writeChannels, id];
      setWriteChannels(next);
      setActiveWriteChannel(id);
    }
  }

  function toggleRepurposeChannel(id) {
    if (repurposeChannels.includes(id)) {
      if (repurposeChannels.length === 1) return addToast("info", "Select at least one network");
      const next = repurposeChannels.filter((c) => c !== id);
      setRepurposeChannels(next);
      if (activeRepurposeChannel === id) setActiveRepurposeChannel(next[0]);
    } else {
      const next = [...repurposeChannels, id];
      setRepurposeChannels(next);
      setActiveRepurposeChannel(id);
    }
  }

  async function auditVariantsInParallel(variants) {
    const entries = await Promise.all(
      variants.map(async (v) => {
        try {
          const audit = await api.guardrails.checkDraft({
            content: v.content?.body || "",
            channel: v.channel,
            hashtags: v.content?.hashtags || [],
            mediaUrls: v.content?.mediaUrls || [],
          });
          return [v.channel, audit];
        } catch {
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter(Boolean));
  }

  // --- Generation Handlers ---
  async function handleGeneratePosts() {
    if (!writeIdea.trim()) {
      return addToast("error", "Please enter an idea or message to write about");
    }
    setWriteLoading(true);
    setSavedVariants({});
    try {
      const res = await api.posts.generateVariants({
        idea: writeIdea,
        channels: writeChannels,
        tone: writeTone,
      });
      const variants = res.variants || [];
      setWriteVariants(variants);
      if (variants.length > 0) {
        setActiveWriteChannel(variants[0].channel);
        const audits = await auditVariantsInParallel(variants);
        setWriteGuardrails(audits);
      }
      addToast(
        "success",
        `Created posts for ${variants.length} ${
          variants.length === 1 ? "network" : "networks"
        }!`
      );
    } catch (err) {
      addToast("error", err.message || "Failed to generate posts");
    } finally {
      setWriteLoading(false);
    }
  }

  async function handleRepurposePost() {
    if (!selectedTopPost) {
      return addToast("error", "Please select a past post to reuse");
    }
    setRepurposingLoading(true);
    setSavedRepurposeVariants({});
    try {
      const res = await api.posts.repurposePost(selectedTopPost.id, {
        targetChannels: repurposeChannels,
        tone: repurposeTone,
      });
      const variants = res.variants || [];
      setRepurposeVariants(variants);
      if (variants.length > 0) {
        setActiveRepurposeChannel(variants[0].channel);
        const audits = await auditVariantsInParallel(variants);
        setRepurposeGuardrails(audits);
      }
      addToast(
        "success",
        `Reused post for ${variants.length} ${
          variants.length === 1 ? "network" : "networks"
        }!`
      );
    } catch (err) {
      addToast("error", err.message || "Failed to reuse post");
    } finally {
      setRepurposingLoading(false);
    }
  }

  async function handleGenerateHashtags() {
    if (!tagContent.trim()) {
      return addToast("error", "Please enter draft text or keywords to analyze");
    }
    setTagLoading(true);
    try {
      const res = await api.ai.suggestHashtags({
        content: tagContent,
        platform: "instagram",
        maxTags: 10,
      });
      setGeneratedTags(res.hashtags || []);
      addToast("success", "Hashtags suggested!");
    } catch (err) {
      addToast("error", err.message || "Hashtags generation failed");
    } finally {
      setTagLoading(false);
    }
  }

  // --- Inline Hashtag Suggestion for Generated Variants ---
  async function handleSuggestHashtagsForVariant(variant, isRepurpose = false) {
    try {
      setSuggestingTagsChannel(variant.channel);
      const res = await api.ai.suggestHashtags({
        content: variant.content?.body || "",
        platform: variant.channel,
        maxTags: 5,
      });
      if (res.hashtags && res.hashtags.length > 0) {
        const tagsStr = res.hashtags.join(" ");
        const currentBody = variant.content?.body || "";
        const updatedBody = currentBody.includes(res.hashtags[0])
          ? currentBody
          : currentBody
          ? `${currentBody}\n\n${tagsStr}`
          : tagsStr;

        if (isRepurpose) {
          setRepurposeVariants((prev) =>
            prev.map((v) =>
              v.channel === variant.channel
                ? {
                    ...v,
                    content: { ...v.content, body: updatedBody },
                    charCount: updatedBody.length,
                  }
                : v
            )
          );
        } else {
          setWriteVariants((prev) =>
            prev.map((v) =>
              v.channel === variant.channel
                ? {
                    ...v,
                    content: { ...v.content, body: updatedBody },
                    charCount: updatedBody.length,
                  }
                : v
            )
          );
        }
        addToast("success", `Added ${res.hashtags.length} hashtags!`);
      } else {
        addToast("info", "No hashtags found");
      }
    } catch (err) {
      addToast("error", err.message || "Could not generate hashtags");
    } finally {
      setSuggestingTagsChannel(null);
    }
  }

  // --- Save Individual Draft ---
  async function handleSaveVariantDraft(variant) {
    setSavingVariantChannel(variant.channel);
    try {
      await api.posts.batchCreate([
        {
          channel: variant.channel,
          title: variant.content?.title || `Post for ${variant.channel}`,
          body: variant.content?.body || "",
          hashtags: variant.content?.hashtags || [],
          aiMetadata: {
            provider: variant.provider,
            model: variant.model,
            tone: writeTone,
            idea: writeIdea,
            source: "ai_write",
          },
        },
      ]);
      setSavedVariants((prev) => ({ ...prev, [variant.channel]: true }));
      onDraftCreated?.();
      addToast("success", `Saved ${variant.channel} post as draft!`);
    } catch (err) {
      addToast("error", err.message || "Failed to save draft");
    } finally {
      setSavingVariantChannel(null);
    }
  }

  async function handleSaveRepurposeVariantDraft(variant) {
    setSavingRepurposeVariantChannel(variant.channel);
    try {
      await api.posts.batchCreate([
        {
          channel: variant.channel,
          title: variant.content?.title || `Repurposed for ${variant.channel}`,
          body: variant.content?.body || "",
          hashtags: variant.content?.hashtags || [],
          aiMetadata: {
            provider: variant.provider,
            model: variant.model,
            tone: repurposeTone,
            sourcePostId: selectedTopPost?.id,
            repurposed: true,
          },
        },
      ]);
      setSavedRepurposeVariants((prev) => ({ ...prev, [variant.channel]: true }));
      onDraftCreated?.();
      addToast("success", `Saved ${variant.channel} post as draft!`);
    } catch (err) {
      addToast("error", err.message || "Failed to save draft");
    } finally {
      setSavingRepurposeVariantChannel(null);
    }
  }

  // --- Multi-Model AI Handlers ---
  async function handleGenerateMultiModel() {
    if (!modelTopic.trim()) {
      return addToast("error", "Please enter a topic or copy to generate");
    }
    setModelLoading(true);
    setSavedCandidate(false);
    try {
      const res = await api.ai.generateCaption({
        topic: modelTopic,
        platform: modelPlatform,
        tone: modelTone,
      });

      const rawCandidates =
        res.candidates && res.candidates.length > 0
          ? res.candidates
          : [
              {
                provider: "default",
                label: "SteadyPost AI",
                model: res.model || "standard",
                caption: res.caption,
                status: "success",
                error: null,
                guardrails: res.guardrails || null,
              },
            ];

      // Ensure every successful candidate has its own guardrails audit
      const auditedCandidates = await Promise.all(
        rawCandidates.map(async (cand) => {
          if (cand.status === "success" && cand.caption && !cand.guardrails) {
            try {
              const audit = await api.guardrails.checkDraft({
                content: cand.caption,
                channel: modelPlatform,
              });
              return { ...cand, guardrails: audit };
            } catch {
              return { ...cand, guardrails: null };
            }
          }
          return cand;
        })
      );

      setCandidates(auditedCandidates);

      const firstSuccess = auditedCandidates.findIndex(
        (c) => c.status === "success" && c.caption
      );
      const chosenIdx = firstSuccess >= 0 ? firstSuccess : 0;
      setSelectedCandidateIndex(chosenIdx);
      setModelGuardrails(auditedCandidates[chosenIdx]?.guardrails || null);
      addToast(
        "success",
        `Evaluated copy across ${auditedCandidates.filter((c) => c.status === "success").length} models!`
      );
    } catch (err) {
      addToast("error", err.message || "Failed to generate multi-model captions");
    } finally {
      setModelLoading(false);
    }
  }

  async function handleSaveCandidateDraft(candidate) {
    if (!candidate?.caption) return;
    setSavingCandidate(true);
    try {
      await api.posts.create({
        channel: modelPlatform,
        title: `${modelPlatform.charAt(0).toUpperCase() + modelPlatform.slice(1)} Post: ${modelTopic.slice(0, 30)}`,
        body: candidate.caption,
        status: "draft",
        aiMetadata: {
          provider: candidate.provider,
          model: candidate.model,
          tone: modelTone,
          topic: modelTopic,
          guardrails: candidate.guardrails || modelGuardrails,
        },
      });
      setSavedCandidate(true);
      onDraftCreated?.();
      addToast("success", `Saved ${modelPlatform} post as draft!`);
    } catch (err) {
      addToast("error", err.message || "Failed to save draft");
    } finally {
      setSavingCandidate(false);
    }
  }

  async function handleAuditCandidate(candidate) {
    if (!candidate?.caption) return;
    try {
      const audit = await api.guardrails.checkDraft({
        content: candidate.caption,
        channel: modelPlatform,
      });
      setCandidates((prev) =>
        prev.map((c) =>
          c.provider === candidate.provider && c.caption === candidate.caption
            ? { ...c, guardrails: audit }
            : c
        )
      );
      setModelGuardrails(audit);
      addToast(
        "info",
        `Guardrails audit: ${audit.score}/100 (${audit.passed ? "Passed" : "Issues Flagged"})`
      );
    } catch (err) {
      addToast("error", err.message || "Guardrails audit failed");
    }
  }

  // --- Shared Actions ---
  function copyText(text, key) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    addToast("info", "Copied to clipboard!");
  }

  function applyToEditor(text) {
    if (onInsert) onInsert(text);
    setAiModalOpen(false);
    addToast("success", "Inserted into Content Studio!");
  }

  if (!isAiModalOpen) return null;

  const currentWriteVariant = writeVariants.find((v) => v.channel === activeWriteChannel);
  const currentRepurposeVariant = repurposeVariants.find(
    (v) => v.channel === activeRepurposeChannel
  );
  const selectedCandidate =
    candidates.length > 0 && candidates[selectedCandidateIndex]?.status === "success"
      ? candidates[selectedCandidateIndex]
      : candidates.find((c) => c.status === "success") || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl p-6 rounded-xl bg-slate-900 border border-slate-800 max-h-[92vh] overflow-y-auto shadow-2xl">
        <button
          onClick={() => setAiModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md gradient-brand flex items-center justify-center shadow-md">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Write with AI</h2>
            <p className="text-xs text-slate-400">
              Turn an idea into platform-ready posts or reuse your past content.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab("write")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "write"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            <span>Write posts</span>
          </button>

          <button
            onClick={() => setActiveTab("multi_model")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "multi_model"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span>⚡ Multi-Model AI</span>
          </button>

          <button
            onClick={() => setActiveTab("repurpose")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "repurpose"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Reuse past post</span>
          </button>

          <button
            onClick={() => setActiveTab("hashtags")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "hashtags"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span># Hashtags</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: WRITE POSTS                                        */}
        {/* ========================================================= */}
        {activeTab === "write" && (
          <div className="space-y-5">
            {/* Input Box */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  What would you like to post about?
                </label>
                <span className="text-[11px] text-slate-500">
                  1 idea becomes {writeChannels.length} platform-native{" "}
                  {writeChannels.length === 1 ? "post" : "posts"}
                </span>
              </div>
              <textarea
                rows={3}
                value={writeIdea}
                onChange={(e) => setWriteIdea(e.target.value)}
                placeholder="e.g. Fresh sourdough baked every morning with locally sourced organic grains, warm out of the oven every Friday at 7 AM at our downtown bakery..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* Target Networks & Tone */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-7 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Target Networks
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_CHANNELS.map((ch) => {
                    const isSelected = writeChannels.includes(ch.id);
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleWriteChannel(ch.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-md border text-xs font-semibold transition ${
                          isSelected
                            ? ch.color
                            : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{ch.label}</span>
                        {isSelected && <CheckIcon className="w-3.5 h-3.5 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-5 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Tone
                </label>
                <select
                  value={writeTone}
                  onChange={(e) => setWriteTone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none focus:border-indigo-500"
                >
                  {UNIFIED_TONES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Defaults to your business profile tone.
                </p>
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleGeneratePosts}
              disabled={writeLoading}
              className="w-full py-3 rounded-md gradient-brand text-white text-xs font-bold hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
            >
              {writeLoading ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  <span>Writing posts…</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  <span>
                    Generate Posts ({writeChannels.length}{" "}
                    {writeChannels.length === 1 ? "Network" : "Networks"})
                  </span>
                </>
              )}
            </button>

            {/* Generated Channel Variants View */}
            {writeVariants.length > 0 && (
              <div className="mt-6 space-y-4 pt-4 border-t border-slate-800">
                {/* Channel Switcher */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-slate-950 border border-slate-800">
                  {writeVariants.map((v) => {
                    const spec = AVAILABLE_CHANNELS.find((c) => c.id === v.channel);
                    const Icon = spec?.icon || SparklesIcon;
                    const isActive = activeWriteChannel === v.channel;
                    return (
                      <button
                        key={v.channel}
                        onClick={() => setActiveWriteChannel(v.channel)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="capitalize">{v.channel}</span>
                        {savedVariants[v.channel] && (
                          <span className="text-[10px] text-emerald-300 font-normal">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Channel Variant Card */}
                {currentWriteVariant && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                          {currentWriteVariant.channel} Post
                        </span>
                        {currentWriteVariant.provider === "template" && (
                          <span className="text-[10px] px-2 py-0.5 rounded border font-medium bg-amber-950/40 text-amber-300 border-amber-800/60">
                            Fallback Template
                          </span>
                        )}
                      </div>

                      {/* Character Count shown only when close to limit */}
                      {currentWriteVariant.charCount > currentWriteVariant.maxChars * 0.85 && (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono font-medium ${
                              currentWriteVariant.charCount > currentWriteVariant.maxChars
                                ? "text-rose-400"
                                : "text-amber-400"
                            }`}
                          >
                            {currentWriteVariant.charCount} / {currentWriteVariant.maxChars} chars
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Formatted Copy Preview */}
                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {currentWriteVariant.content.body}
                    </div>

                    {/* Brand Guardrails & Voice Audit (F09) */}
                    <GuardrailsAuditCard
                      report={writeGuardrails[currentWriteVariant.channel]}
                      onReaudit={() => auditVariant(currentWriteVariant, false)}
                      loading={auditingChannel === currentWriteVariant.channel}
                    />

                    {/* Actions: Hashtags, Copy, Use in editor, Save as Draft */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => handleSuggestHashtagsForVariant(currentWriteVariant, false)}
                        disabled={suggestingTagsChannel === currentWriteVariant.channel}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
                      >
                        {suggestingTagsChannel === currentWriteVariant.channel ? (
                          <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>#</span>
                        )}
                        <span>Suggest Hashtags</span>
                      </button>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() =>
                            copyText(
                              currentWriteVariant.content.body,
                              `write_${currentWriteVariant.channel}`
                            )
                          }
                          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                        >
                          {copiedKey === `write_${currentWriteVariant.channel}`
                            ? "Copied!"
                            : "Copy"}
                        </button>

                        <button
                          onClick={() => applyToEditor(currentWriteVariant.content.body)}
                          className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold transition"
                        >
                          Use in editor
                        </button>

                        <button
                          onClick={() => handleSaveVariantDraft(currentWriteVariant)}
                          disabled={
                            savingVariantChannel === currentWriteVariant.channel ||
                            savedVariants[currentWriteVariant.channel]
                          }
                          className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {savingVariantChannel === currentWriteVariant.channel ? (
                            <>
                              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving…</span>
                            </>
                          ) : savedVariants[currentWriteVariant.channel] ? (
                            <>
                              <CheckIcon className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <span>Save as Draft</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MULTI-MODEL AI COMPARISON (GROQ, OPENROUTER, GEMINI)*/}
        {/* ========================================================= */}
        {activeTab === "multi_model" && (
          <div className="space-y-5">
            {/* Input Box */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Topic, Promotion, or Message
                </label>
                <span className="text-[11px] text-slate-500">
                  Compare Groq, OpenRouter & Gemini side-by-side
                </span>
              </div>
              <textarea
                rows={3}
                value={modelTopic}
                onChange={(e) => setModelTopic(e.target.value)}
                placeholder="e.g. Announcing our spring seasonal menu with artisan pastries and locally roasted coffee..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* Target Platform & Tone */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Target Platform
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {MULTI_MODEL_PLATFORMS.map((p) => {
                    const Icon = p.icon;
                    const isSelected = modelPlatform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setModelPlatform(p.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-semibold transition ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-950/40 text-indigo-200"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-5 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Brand Tone
                </label>
                <select
                  value={modelTone}
                  onChange={(e) => setModelTone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none focus:border-indigo-500"
                >
                  {UNIFIED_TONES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Defaults to your business profile tone.
                </p>
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleGenerateMultiModel}
              disabled={modelLoading}
              className="w-full py-3 rounded-md gradient-brand text-white text-xs font-bold hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
            >
              {modelLoading ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  <span>Evaluating across 3 LLM models in parallel…</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  <span>Generate Captions with All 3 Models</span>
                </>
              )}
            </button>

            {/* Candidates Comparison Grid */}
            {candidates.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Compare & Select Preferred Model
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Click any model card below to inspect and use its generated copy.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-indigo-400">
                    {candidates.filter((c) => c.status === "success").length} of {candidates.length} models ready
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {candidates.map((cand, idx) => {
                    const isSelected = selectedCandidateIndex === idx;
                    const isSuccess = cand.status === "success" && cand.caption;
                    const isUnconfigured = cand.status === "not_configured";

                    const providerTheme = {
                      groq: {
                        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                        accent: "border-emerald-500/40",
                        icon: "⚡",
                        name: "Groq",
                      },
                      openrouter: {
                        badge: "bg-purple-500/10 text-purple-400 border-purple-500/30",
                        accent: "border-purple-500/40",
                        icon: "🌐",
                        name: "OpenRouter",
                      },
                      gemini: {
                        badge: "bg-sky-500/10 text-sky-400 border-sky-500/30",
                        accent: "border-sky-500/40",
                        icon: "✨",
                        name: "Google Gemini",
                      },
                    }[cand.provider] || {
                      badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
                      accent: "border-indigo-500/40",
                      icon: "🤖",
                      name: cand.label || "AI Model",
                    };

                    const charCount = cand.caption ? cand.caption.length : 0;
                    const wordCount = cand.caption
                      ? cand.caption.split(/\s+/).filter(Boolean).length
                      : 0;

                    return (
                      <div
                        key={idx}
                        onClick={() => isSuccess && setSelectedCandidateIndex(idx)}
                        className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "bg-slate-950 border-indigo-500 ring-1 ring-indigo-500/40"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                        } ${!isSuccess ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border flex items-center gap-1 ${providerTheme.badge}`}
                            >
                              <span>{providerTheme.icon}</span>
                              <span>{providerTheme.name}</span>
                            </span>
                            {isSelected && (
                              <span className="text-[10px] text-indigo-300 font-semibold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/60">
                                Selected
                              </span>
                            )}
                          </div>

                          {isSuccess ? (
                            <p className="text-xs text-slate-300 line-clamp-4 leading-relaxed font-sans">
                              {cand.caption}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500 italic">
                              {isUnconfigured
                                ? "API key not configured in .env"
                                : cand.error || "Generation error"}
                            </p>
                          )}
                        </div>

                        {isSuccess && (
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-3 border-t border-slate-900 mt-2">
                            <span>{wordCount} words</span>
                            <span>{charCount} chars</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Selected Candidate Detailed Inspection & Actions */}
                {selectedCandidate && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                          {selectedCandidate.label || selectedCandidate.provider} Candidate Copy
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({selectedCandidate.model || "standard"})
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {selectedCandidate.caption?.length || 0} characters
                      </span>
                    </div>

                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {selectedCandidate.caption}
                    </div>

                    {/* F09 Brand Guardrails & Voice Audit */}
                    <GuardrailsAuditCard
                      report={selectedCandidate.guardrails || null}
                      onReaudit={() => handleAuditCandidate(selectedCandidate)}
                    />

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => copyText(selectedCandidate.caption, "multi_model_copy")}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                      >
                        {copiedKey === "multi_model_copy" ? "Copied!" : "Copy"}
                      </button>

                      <button
                        onClick={() => applyToEditor(selectedCandidate.caption)}
                        className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold transition"
                      >
                        Use in editor
                      </button>

                      <button
                        onClick={() => handleSaveCandidateDraft(selectedCandidate)}
                        disabled={savingCandidate || savedCandidate}
                        className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow disabled:opacity-60 flex items-center gap-1.5"
                      >
                        {savingCandidate ? (
                          <>
                            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving…</span>
                          </>
                        ) : savedCandidate ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Saved</span>
                          </>
                        ) : (
                          <span>Save as Draft</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: REUSE A PAST POST                                  */}
        {/* ========================================================= */}
        {activeTab === "repurpose" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Select a Past Published Post
                </h3>
                <p className="text-[11px] text-slate-400">
                  Select a past post to adapt into fresh updates for your networks.
                </p>
              </div>

              {topPosts.length > 0 && (
                <button
                  onClick={loadTopPosts}
                  disabled={loadingTopPosts}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 self-start sm:self-auto"
                >
                  <RefreshIcon
                    className={`w-3.5 h-3.5 ${loadingTopPosts ? "animate-spin" : ""}`}
                  />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {loadingTopPosts ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin text-indigo-500" />
                <span>Checking published posts…</span>
              </div>
            ) : topPosts.length === 0 ? (
              <div className="p-8 rounded-lg bg-slate-950 border border-slate-800 text-center space-y-3">
                <p className="text-xs text-slate-300 font-medium">No published posts yet.</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Once you publish posts across your connected channels, your top-performing
                  content will appear here so you can easily turn winning posts into fresh updates.
                </p>
                <button
                  onClick={() => setActiveTab("write")}
                  className="mt-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                >
                  Write a new post instead
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                {topPosts.map((post) => {
                  const isSelected = selectedTopPost?.id === post.id;
                  const channelSpec = AVAILABLE_CHANNELS.find((c) => c.id === post.channel);
                  const Icon = channelSpec?.icon || SparklesIcon;
                  return (
                    <div
                      key={post.id}
                      onClick={() => setSelectedTopPost(post)}
                      className={`p-3.5 rounded-lg border text-xs cursor-pointer transition flex flex-col justify-between gap-2.5 ${
                        isSelected
                          ? "bg-indigo-950/40 border-indigo-500/70 shadow-md text-white"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-bold capitalize text-slate-200">
                            <Icon className="w-3.5 h-3.5" />
                            {post.channel}
                          </span>
                          <span className="text-[10px] text-slate-500 capitalize">{post.status}</span>
                        </div>
                        <p className="text-xs font-semibold text-white line-clamp-1">
                          {post.content?.title || "Untitled Post"}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {post.content?.body}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                        {post.metrics?.hasMetrics ? (
                          <div className="flex items-center gap-2.5 font-mono">
                            <span>❤️ {post.metrics.likes}</span>
                            <span>💬 {post.metrics.comments}</span>
                            <span>🔁 {post.metrics.shares}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">Published Post</span>
                        )}
                        {isSelected && <span className="text-indigo-400 font-bold">Selected ✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Repurposing Target Configuration */}
            {selectedTopPost && topPosts.length > 0 && (
              <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Reuse Selected Post for Other Networks
                  </span>
                  <span className="text-[11px] text-indigo-400">
                    Source: {selectedTopPost.channel.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-8 space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">
                      Target Networks
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {AVAILABLE_CHANNELS.map((ch) => {
                        const isSelected = repurposeChannels.includes(ch.id);
                        const Icon = ch.icon;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => toggleRepurposeChannel(ch.id)}
                            className={`flex items-center gap-2 p-2 rounded border text-xs font-semibold transition ${
                              isSelected
                                ? ch.color
                                : "border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="capitalize">{ch.label}</span>
                            {isSelected && <CheckIcon className="w-3 h-3 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-4 space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">Tone</label>
                    <select
                      value={repurposeTone}
                      onChange={(e) => setRepurposeTone(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {UNIFIED_TONES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleRepurposePost}
                  disabled={repurposingLoading}
                  className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-bold hover:opacity-95 transition flex items-center justify-center gap-2 shadow"
                >
                  {repurposingLoading ? (
                    <>
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                      <span>Adapting past post…</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      <span>
                        Reuse Post for {repurposeChannels.length}{" "}
                        {repurposeChannels.length === 1 ? "Network" : "Networks"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Repurposed Variants Preview */}
            {repurposeVariants.length > 0 && (
              <div className="mt-4 space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-slate-950 border border-slate-800">
                  {repurposeVariants.map((v) => {
                    const spec = AVAILABLE_CHANNELS.find((c) => c.id === v.channel);
                    const Icon = spec?.icon || SparklesIcon;
                    const isActive = activeRepurposeChannel === v.channel;
                    return (
                      <button
                        key={v.channel}
                        onClick={() => setActiveRepurposeChannel(v.channel)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="capitalize">{v.channel}</span>
                        {savedRepurposeVariants[v.channel] && (
                          <span className="text-[10px] text-emerald-300 font-normal">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {currentRepurposeVariant && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                          {currentRepurposeVariant.channel} Post
                        </span>
                        {currentRepurposeVariant.provider === "template" && (
                          <span className="text-[10px] px-2 py-0.5 rounded border font-medium bg-amber-950/40 text-amber-300 border-amber-800/60">
                            Fallback Template
                          </span>
                        )}
                      </div>

                      {currentRepurposeVariant.charCount >
                        currentRepurposeVariant.maxChars * 0.85 && (
                        <span
                          className={`text-xs font-mono font-medium ${
                            currentRepurposeVariant.charCount > currentRepurposeVariant.maxChars
                              ? "text-rose-400"
                              : "text-amber-400"
                          }`}
                        >
                          {currentRepurposeVariant.charCount} / {currentRepurposeVariant.maxChars}{" "}
                          chars
                        </span>
                      )}
                    </div>

                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {currentRepurposeVariant.content.body}
                    </div>

                    {/* Brand Guardrails & Voice Audit (F09) */}
                    <GuardrailsAuditCard
                      report={repurposeGuardrails[currentRepurposeVariant.channel]}
                      onReaudit={() => auditVariant(currentRepurposeVariant, true)}
                      loading={auditingChannel === currentRepurposeVariant.channel}
                    />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() =>
                          handleSuggestHashtagsForVariant(currentRepurposeVariant, true)
                        }
                        disabled={suggestingTagsChannel === currentRepurposeVariant.channel}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
                      >
                        {suggestingTagsChannel === currentRepurposeVariant.channel ? (
                          <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>#</span>
                        )}
                        <span>Suggest Hashtags</span>
                      </button>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() =>
                            copyText(
                              currentRepurposeVariant.content.body,
                              `repurpose_${currentRepurposeVariant.channel}`
                            )
                          }
                          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                        >
                          {copiedKey === `repurpose_${currentRepurposeVariant.channel}`
                            ? "Copied!"
                            : "Copy"}
                        </button>

                        <button
                          onClick={() => applyToEditor(currentRepurposeVariant.content.body)}
                          className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold transition"
                        >
                          Use in editor
                        </button>

                        <button
                          onClick={() =>
                            handleSaveRepurposeVariantDraft(currentRepurposeVariant)
                          }
                          disabled={
                            savingRepurposeVariantChannel === currentRepurposeVariant.channel ||
                            savedRepurposeVariants[currentRepurposeVariant.channel]
                          }
                          className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {savingRepurposeVariantChannel === currentRepurposeVariant.channel ? (
                            <>
                              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving…</span>
                            </>
                          ) : savedRepurposeVariants[currentRepurposeVariant.channel] ? (
                            <>
                              <CheckIcon className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <span>Save as Draft</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: HASHTAGS                                           */}
        {/* ========================================================= */}
        {activeTab === "hashtags" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Content or Topic to Analyze
              </label>
              <textarea
                rows={4}
                value={tagContent}
                onChange={(e) => setTagContent(e.target.value)}
                placeholder="e.g. Sourdough bread, artisanal bakery, fresh morning croissants, organic wheat..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleGenerateHashtags}
              disabled={tagLoading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{tagLoading ? "Analyzing Keywords…" : "Find Hashtags"}</span>
            </button>

            {generatedTags.length > 0 && (
              <div className="p-4 rounded-md bg-slate-950 border border-indigo-500/40 space-y-3">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                  <span>Suggested Hashtags ({generatedTags.length})</span>
                  <button
                    onClick={() => applyToEditor(`\n\n${generatedTags.join(" ")}`)}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                  >
                    Append All to Draft
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {generatedTags.map((tag, i) => (
                    <span
                      key={i}
                      onClick={() => applyToEditor(` ${tag}`)}
                      className="px-2.5 py-1 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300 text-xs font-medium cursor-pointer hover:bg-indigo-900/80 transition"
                      title="Click to insert"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
