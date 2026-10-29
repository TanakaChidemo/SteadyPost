"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  CheckIcon,
  RefreshIcon,
  SpinnerIcon,
} from "./Icons";

// Only networks where publishing is currently supported
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

export function AIModal({ onInsert, initialContent, onDraftCreated }) {
  const { isAiModalOpen, setAiModalOpen, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState("write"); // write | repurpose | hashtags

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

  // --- Tab 2: Reuse a Past Post State ---
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

  // --- Tab 3: Hashtags State ---
  const [tagContent, setTagContent] = useState("");
  const [generatedTags, setGeneratedTags] = useState([]);
  const [tagLoading, setTagLoading] = useState(false);

  // Shared copy state
  const [copiedKey, setCopiedKey] = useState(null);

  // Initialize from initial editor content
  useEffect(() => {
    if (isAiModalOpen && initialContent) {
      setWriteIdea(initialContent);
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
      setWriteVariants(res.variants || []);
      if (res.variants?.length > 0) {
        setActiveWriteChannel(res.variants[0].channel);
      }
      addToast(
        "success",
        `Created posts for ${res.variants?.length || 0} ${
          res.variants?.length === 1 ? "network" : "networks"
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
      setRepurposeVariants(res.variants || []);
      if (res.variants?.length > 0) {
        setActiveRepurposeChannel(res.variants[0].channel);
      }
      addToast(
        "success",
        `Reused post for ${res.variants?.length || 0} ${
          res.variants?.length === 1 ? "network" : "networks"
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
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800 mb-6">
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
            onClick={() => setActiveTab("repurpose")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "repurpose"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Reuse a past post</span>
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
                <div className="grid grid-cols-2 gap-2">
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
        {/* TAB 2: REUSE A PAST POST                                  */}
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
                  Once you publish posts to Instagram or Facebook, your top-performing content
                  will appear here so you can easily turn winning posts into fresh updates.
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
                    <div className="grid grid-cols-2 gap-2">
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
