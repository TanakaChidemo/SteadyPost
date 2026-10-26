"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import {
  SparklesIcon,
  TwitterIcon,
  InstagramIcon,
  LinkedInIcon,
  FacebookIcon,
  CheckIcon,
  RefreshIcon,
  BarChartIcon,
  SpinnerIcon,
} from "./Icons";

const AVAILABLE_CHANNELS = [
  { id: "twitter", label: "Twitter / X", icon: TwitterIcon, maxChars: 280, color: "text-sky-400 border-sky-500/40 bg-sky-500/10" },
  { id: "linkedin", label: "LinkedIn", icon: LinkedInIcon, maxChars: 3000, color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { id: "instagram", label: "Instagram", icon: InstagramIcon, maxChars: 2200, color: "text-pink-400 border-pink-500/40 bg-pink-500/10" },
  { id: "facebook", label: "Facebook", icon: FacebookIcon, maxChars: 5000, color: "text-indigo-400 border-indigo-500/40 bg-indigo-500/10" },
];

const TONE_OPTIONS = [
  { id: "professional", label: "Professional & Strategic" },
  { id: "inspirational", label: "Inspirational & Bold" },
  { id: "authoritative", label: "Authoritative & Insightful" },
  { id: "playful", label: "Playful & Witty" },
  { id: "educational", label: "Actionable & Educational" },
  { id: "casual", label: "Casual & Conversational" },
];

export function AIModal({ onInsert, initialContent, onDraftCreated }) {
  const { isAiModalOpen, setAiModalOpen, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState("omnichannel"); // omnichannel | repurpose_top | caption | hashtags

  // --- Tab 1: Omnichannel Adaptation State ---
  const [omniIdea, setOmniIdea] = useState("");
  const [omniChannels, setOmniChannels] = useState(["instagram", "facebook"]);
  const [omniTone, setOmniTone] = useState("professional");
  const [omniVariants, setOmniVariants] = useState([]);
  const [activeOmniChannel, setActiveOmniChannel] = useState("instagram");
  const [omniLoading, setOmniLoading] = useState(false);
  const [savingOmniDrafts, setSavingOmniDrafts] = useState(false);
  const [copiedChannel, setCopiedChannel] = useState(null);

  // --- Tab 2: Repurpose Top Posts State ---
  const [topPosts, setTopPosts] = useState([]);
  const [loadingTopPosts, setLoadingTopPosts] = useState(false);
  const [hasMetricsData, setHasMetricsData] = useState(false);
  const [selectedTopPost, setSelectedTopPost] = useState(null);
  const [repurposeChannels, setRepurposeChannels] = useState(["instagram", "facebook"]);
  const [repurposeTone, setRepurposeTone] = useState("inspirational");
  const [repurposeVariants, setRepurposeVariants] = useState([]);
  const [activeRepurposeChannel, setActiveRepurposeChannel] = useState("instagram");
  const [repurposingLoading, setRepurposingLoading] = useState(false);
  const [savingRepurposeDrafts, setSavingRepurposeDrafts] = useState(false);

  // --- Tab 3: Single Caption Generator State (Multi-Model) ---
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("casual");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [copiedCaptionIdx, setCopiedCaptionIdx] = useState(null);

  // --- Tab 4: Smart Hashtags State ---
  const [tagContent, setTagContent] = useState("");
  const [generatedTags, setGeneratedTags] = useState([]);
  const [tagLoading, setTagLoading] = useState(false);

  // Initialize from initial editor content
  useEffect(() => {
    if (isAiModalOpen && initialContent) {
      setOmniIdea(initialContent);
      setTopic(initialContent);
      setTagContent(initialContent);
    }
  }, [isAiModalOpen, initialContent]);

  // Load Business Profile tone default
  useEffect(() => {
    if (isAiModalOpen) {
      api.businessProfile.get().then((profile) => {
        if (profile?.tone?.length) {
          const matchedTone = profile.tone[0].toLowerCase();
          setOmniTone(matchedTone);
          setRepurposeTone(matchedTone);
        }
      }).catch(() => {});
    }
  }, [isAiModalOpen]);

  // Fetch top posts when switching to the repurpose tab
  useEffect(() => {
    if (isAiModalOpen && activeTab === "repurpose_top") {
      loadTopPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiModalOpen, activeTab]);

  async function loadTopPosts() {
    setLoadingTopPosts(true);
    try {
      const res = await api.posts.getTopPerforming({ limit: 6 });
      setTopPosts(res.items || []);
      setHasMetricsData(Boolean(res.hasMetrics));
      if (res.items?.length > 0 && !selectedTopPost) {
        setSelectedTopPost(res.items[0]);
      }
    } catch (err) {
      addToast("error", err.message || "Failed to load top posts");
    } finally {
      setLoadingTopPosts(false);
    }
  }

  // --- Tab 1 Handlers: Omnichannel Adaptation ---
  function toggleOmniChannel(id) {
    if (omniChannels.includes(id)) {
      if (omniChannels.length === 1) return addToast("info", "Select at least one channel");
      const next = omniChannels.filter((c) => c !== id);
      setOmniChannels(next);
      if (activeOmniChannel === id) setActiveOmniChannel(next[0]);
    } else {
      const next = [...omniChannels, id];
      setOmniChannels(next);
      setActiveOmniChannel(id);
    }
  }

  async function handleGenerateOmniVariants() {
    if (!omniIdea.trim()) return addToast("error", "Please enter an idea or message to adapt");
    setOmniLoading(true);
    try {
      const res = await api.posts.generateVariants({
        idea: omniIdea,
        channels: omniChannels,
        tone: omniTone,
      });
      setOmniVariants(res.variants || []);
      if (res.variants?.length > 0) {
        setActiveOmniChannel(res.variants[0].channel);
      }
      addToast("success", `Generated platform-native variants for ${res.variants?.length || 0} channels!`);
    } catch (err) {
      addToast("error", err.message || "Failed to generate channel variants");
    } finally {
      setOmniLoading(false);
    }
  }

  async function handleSaveOmniAsDrafts() {
    if (omniVariants.length === 0) return;
    setSavingOmniDrafts(true);
    try {
      const postsToSave = omniVariants.map((v) => ({
        channel: v.channel,
        title: v.content?.title || `Post for ${v.channel}`,
        body: v.content?.body || "",
        hashtags: v.content?.hashtags || [],
        aiMetadata: {
          provider: v.provider,
          model: v.model,
          tone: omniTone,
          idea: omniIdea,
          source: "omnichannel_adaptation",
        },
      }));
      await api.posts.batchCreate(postsToSave);
      onDraftCreated?.();
      addToast("success", `Saved all ${postsToSave.length} channel variants as drafts!`);
    } catch (err) {
      addToast("error", err.message || "Failed to save drafts");
    } finally {
      setSavingOmniDrafts(false);
    }
  }

  // --- Tab 2 Handlers: Repurpose Top Posts ---
  function toggleRepurposeChannel(id) {
    if (repurposeChannels.includes(id)) {
      if (repurposeChannels.length === 1) return addToast("info", "Select at least one channel");
      const next = repurposeChannels.filter((c) => c !== id);
      setRepurposeChannels(next);
      if (activeRepurposeChannel === id) setActiveRepurposeChannel(next[0]);
    } else {
      const next = [...repurposeChannels, id];
      setRepurposeChannels(next);
      setActiveRepurposeChannel(id);
    }
  }

  async function handleRepurposeSelectedPost() {
    if (!selectedTopPost) return addToast("error", "Please select a top-performing post to repurpose");
    setRepurposingLoading(true);
    try {
      const res = await api.posts.repurposePost(selectedTopPost.id, {
        targetChannels: repurposeChannels,
        tone: repurposeTone,
      });
      setRepurposeVariants(res.variants || []);
      if (res.variants?.length > 0) {
        setActiveRepurposeChannel(res.variants[0].channel);
      }
      addToast("success", `Repurposed into ${res.variants?.length || 0} platform-native posts!`);
    } catch (err) {
      addToast("error", err.message || "Failed to repurpose post");
    } finally {
      setRepurposingLoading(false);
    }
  }

  async function handleSaveRepurposedAsDrafts() {
    if (repurposeVariants.length === 0) return;
    setSavingRepurposeDrafts(true);
    try {
      const postsToSave = repurposeVariants.map((v) => ({
        channel: v.channel,
        title: v.content?.title || `Repurposed for ${v.channel}`,
        body: v.content?.body || "",
        hashtags: v.content?.hashtags || [],
        aiMetadata: {
          provider: v.provider,
          model: v.model,
          tone: repurposeTone,
          sourcePostId: selectedTopPost?.id,
          repurposed: true,
        },
      }));
      await api.posts.batchCreate(postsToSave);
      onDraftCreated?.();
      addToast("success", `Saved ${postsToSave.length} repurposed variants as drafts!`);
    } catch (err) {
      addToast("error", err.message || "Failed to save drafts");
    } finally {
      setSavingRepurposeDrafts(false);
    }
  }

  // --- Tab 3 Handlers: Single Caption Multi-Model ---
  async function handleGenerateCaption() {
    if (!topic.trim()) return addToast("error", "Please enter a topic or concept");
    setCaptionLoading(true);
    try {
      const res = await api.ai.generateCaption({ topic, platform, tone });
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
              },
            ];
      setCandidates(rawCandidates);
      const firstSuccess = rawCandidates.findIndex((c) => c.status === "success" && c.caption);
      setSelectedCandidateIndex(firstSuccess >= 0 ? firstSuccess : 0);
      addToast("success", "Multi-model captions generated!");
    } catch (err) {
      addToast("error", err.message || "Caption generation failed");
    } finally {
      setCaptionLoading(false);
    }
  }

  // --- Tab 4 Handlers: Hashtags ---
  async function handleGenerateHashtags() {
    if (!tagContent.trim()) return addToast("error", "Please enter draft text to analyze");
    setTagLoading(true);
    try {
      const res = await api.ai.suggestHashtags({ content: tagContent, platform: "instagram", maxTags: 10 });
      setGeneratedTags(res.hashtags || []);
      addToast("success", "Smart hashtags generated!");
    } catch (err) {
      addToast("error", err.message || "Hashtags generation failed");
    } finally {
      setTagLoading(false);
    }
  }

  // Shared Actions
  function copyText(text, key) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (key === "caption") {
      setCopiedCaptionIdx(selectedCandidateIndex);
      setTimeout(() => setCopiedCaptionIdx(null), 2000);
    } else {
      setCopiedChannel(key);
      setTimeout(() => setCopiedChannel(null), 2000);
    }
    addToast("info", "Copied to clipboard!");
  }

  function applyToEditor(text) {
    if (onInsert) onInsert(text);
    setAiModalOpen(false);
    addToast("success", "Inserted into Content Studio!");
  }

  if (!isAiModalOpen) return null;

  const currentOmniVariant = omniVariants.find((v) => v.channel === activeOmniChannel);
  const currentRepurposeVariant = repurposeVariants.find((v) => v.channel === activeRepurposeChannel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl p-6 rounded-xl bg-slate-900 border border-slate-800 max-h-[92vh] overflow-y-auto shadow-2xl">
        <button
          onClick={() => setAiModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md gradient-brand flex items-center justify-center shadow-md">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">AI Content & Repurposing Engine</h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Core v2
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Adapt 1 idea into platform-native variants or repurpose your top-performing posts across channels.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab("omnichannel")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "omnichannel"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <SparklesIcon className="w-3.5 h-3.5 text-indigo-300" />
            <span>Omnichannel Adapt</span>
          </button>

          <button
            onClick={() => setActiveTab("repurpose_top")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "repurpose_top"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <BarChartIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Repurpose Top Posts</span>
          </button>

          <button
            onClick={() => setActiveTab("caption")}
            className={`py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === "caption"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <span>Multi-Model AI</span>
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
        {/* TAB 1: OMNICHANNEL ADAPTATION (CORE GENERATION LOOP #05) */}
        {/* ========================================================= */}
        {activeTab === "omnichannel" && (
          <div className="space-y-5">
            {/* Input Box */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Core Idea, Announcement, or Draft Thought
                </label>
                <span className="text-[11px] text-slate-500">1 idea becomes 4 platform-native posts</span>
              </div>
              <textarea
                rows={3}
                value={omniIdea}
                onChange={(e) => setOmniIdea(e.target.value)}
                placeholder="e.g. Fresh sourdough baked every morning with locally sourced grains, available starting this Friday at our downtown bakery..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* Channel Selection & Tone */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-7 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Target Networks
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_CHANNELS.map((ch) => {
                    const isSelected = omniChannels.includes(ch.id);
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleOmniChannel(ch.id)}
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
                  Editorial Tone
                </label>
                <select
                  value={omniTone}
                  onChange={(e) => setOmniTone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none focus:border-indigo-500"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Auto-tuned with your workspace business profile and platform norms.
                </p>
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleGenerateOmniVariants}
              disabled={omniLoading}
              className="w-full py-3 rounded-md gradient-brand text-white text-xs font-bold hover:opacity-95 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
            >
              {omniLoading ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  <span>Generating Platform-Native Variants…</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  <span>Generate Platform Variants ({omniChannels.length} Channels)</span>
                </>
              )}
            </button>

            {/* Generated Channel Variants View */}
            {omniVariants.length > 0 && (
              <div className="mt-6 space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Channel Switcher */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-slate-950 border border-slate-800">
                    {omniVariants.map((v) => {
                      const spec = AVAILABLE_CHANNELS.find((c) => c.id === v.channel);
                      const Icon = spec?.icon || SparklesIcon;
                      const isActive = activeOmniChannel === v.channel;
                      return (
                        <button
                          key={v.channel}
                          onClick={() => setActiveOmniChannel(v.channel)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
                            isActive
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="capitalize">{v.channel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Batch Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveOmniAsDrafts}
                      disabled={savingOmniDrafts}
                      className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
                    >
                      {savingOmniDrafts ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>Save All as Drafts</span>
                    </button>
                  </div>
                </div>

                {/* Active Channel Variant Card */}
                {currentOmniVariant && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                          {currentOmniVariant.channel} Native Adaptation
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                            currentOmniVariant.provider === "groq"
                              ? "bg-indigo-950/70 text-indigo-300 border-indigo-700/60"
                              : "bg-amber-950/40 text-amber-300 border-amber-800/60"
                          }`}
                        >
                          {currentOmniVariant.provider === "groq"
                            ? `Groq (${currentOmniVariant.model || "LLM"})`
                            : "Fallback Template (AI Unavailable)"}
                        </span>
                      </div>

                      {/* Character Count Pill with Platform Limits */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono font-medium ${
                            currentOmniVariant.charCount > currentOmniVariant.maxChars
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {currentOmniVariant.charCount} / {currentOmniVariant.maxChars} chars
                        </span>
                      </div>
                    </div>

                    {/* Formatted Copy Preview */}
                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {currentOmniVariant.content.body}
                    </div>

                    {/* Hashtags Chips */}
                    {currentOmniVariant.content.hashtags?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-semibold mr-1">Tags:</span>
                        {currentOmniVariant.content.hashtags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-[11px] font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Variant Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => copyText(currentOmniVariant.content.body, currentOmniVariant.channel)}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                      >
                        {copiedChannel === currentOmniVariant.channel ? "Copied!" : "Copy Copy"}
                      </button>

                      <button
                        onClick={() => applyToEditor(currentOmniVariant.content.body)}
                        className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow"
                      >
                        Insert into Editor
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: REPURPOSE TOP POSTS (POSTMETRICS READ PATH #19)     */}
        {/* ========================================================= */}
        {activeTab === "repurpose_top" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Select a Past High-Performing Post
                </h3>
                <p className="text-[11px] text-slate-400">
                  {hasMetricsData
                    ? "Ranked by composite engagement score (likes, comments, shares, clicks, reach)."
                    : "Showing recent workspace posts. Repurposing works instantly with or without recorded metrics."}
                </p>
              </div>

              <button
                onClick={loadTopPosts}
                disabled={loadingTopPosts}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 self-start sm:self-auto"
              >
                <RefreshIcon className={`w-3.5 h-3.5 ${loadingTopPosts ? "animate-spin" : ""}`} />
                <span>Refresh Posts</span>
              </button>
            </div>

            {loadingTopPosts ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin text-indigo-500" />
                <span>Scanning workspace post history and metrics…</span>
              </div>
            ) : topPosts.length === 0 ? (
              <div className="p-8 rounded-lg bg-slate-950 border border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-400 font-medium">No posts found in this workspace yet.</p>
                <p className="text-[11px] text-slate-600">
                  Write or publish posts in Content Studio to unlock post repurposing!
                </p>
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

                      {/* Performance Metric Badges */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                        {post.metrics?.hasMetrics ? (
                          <div className="flex items-center gap-2.5 font-mono">
                            <span>❤️ {post.metrics.likes}</span>
                            <span>💬 {post.metrics.comments}</span>
                            <span>🔁 {post.metrics.shares}</span>
                            <span>👥 {post.metrics.reach}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Recent Workspace Post</span>
                        )}
                        {isSelected && <span className="text-indigo-400 font-bold">Selected ✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Repurposing Target Configuration */}
            {selectedTopPost && (
              <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Repurpose Selected Post Across Target Channels
                  </span>
                  <span className="text-[11px] text-indigo-400">
                    Source: {selectedTopPost.channel.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-8 space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">Target Channels</label>
                    <div className="grid grid-cols-3 gap-2">
                      {AVAILABLE_CHANNELS.map((ch) => {
                        const isSelected = repurposeChannels.includes(ch.id);
                        const Icon = ch.icon;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => toggleRepurposeChannel(ch.id)}
                            className={`flex items-center gap-1.5 p-2 rounded border text-xs font-semibold transition ${
                              isSelected
                                ? ch.color
                                : "border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="capitalize">{ch.id}</span>
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
                      {TONE_OPTIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleRepurposeSelectedPost}
                  disabled={repurposingLoading}
                  className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-bold hover:opacity-95 transition flex items-center justify-center gap-2 shadow"
                >
                  {repurposingLoading ? (
                    <>
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                      <span>Adapting Top Post into Channels…</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      <span>Repurpose Top Post for {repurposeChannels.length} Channels</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Repurposed Variants Preview */}
            {repurposeVariants.length > 0 && (
              <div className="mt-4 space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
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
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleSaveRepurposedAsDrafts}
                    disabled={savingRepurposeDrafts}
                    className="px-3.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
                  >
                    {savingRepurposeDrafts ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>Save All as Drafts</span>
                  </button>
                </div>

                {currentRepurposeVariant && (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                          {currentRepurposeVariant.channel} Adapted Copy
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                            currentRepurposeVariant.provider === "groq"
                              ? "bg-indigo-950/70 text-indigo-300 border-indigo-700/60"
                              : "bg-amber-950/40 text-amber-300 border-amber-800/60"
                          }`}
                        >
                          {currentRepurposeVariant.provider === "groq"
                            ? `Groq (${currentRepurposeVariant.model || "LLM"})`
                            : "Fallback Template (AI Unavailable)"}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-mono font-medium ${
                          currentRepurposeVariant.charCount > currentRepurposeVariant.maxChars
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {currentRepurposeVariant.charCount} / {currentRepurposeVariant.maxChars} chars
                      </span>
                    </div>

                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {currentRepurposeVariant.content.body}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => copyText(currentRepurposeVariant.content.body, currentRepurposeVariant.channel)}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                      >
                        {copiedChannel === currentRepurposeVariant.channel ? "Copied!" : "Copy"}
                      </button>

                      <button
                        onClick={() => applyToEditor(currentRepurposeVariant.content.body)}
                        className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow"
                      >
                        Insert into Editor
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: MULTI-MODEL CAPTION GENERATOR                      */}
        {/* ========================================================= */}
        {activeTab === "caption" && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {topic ? "Your post topic (edit to redirect the AI)" : "What is your post about?"}
              </label>
              <textarea
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Announcing our 2026 AI Product Roadmap with automated scheduler & instant analytics..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Primary Platform</label>
                <div className="flex gap-2">
                  {[
                    { id: "instagram", label: "Instagram", icon: InstagramIcon },
                    { id: "facebook", label: "Facebook", icon: FacebookIcon },
                  ].map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlatform(p.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-xs font-semibold transition ${
                          platform === p.id
                            ? "border-indigo-500 bg-indigo-950/40 text-indigo-200"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tone of Voice</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs font-medium text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="casual">Casual & Friendly</option>
                  <option value="professional">Professional & Direct</option>
                  <option value="excited">Energetic & Inspiring</option>
                  <option value="witty">Witty & Playful</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateCaption}
              disabled={captionLoading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{captionLoading ? "Synthesizing across models…" : "Generate with AI"}</span>
            </button>

            {candidates.length > 0 && (
              <div className="space-y-4 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Model Comparison</span>
                  <span className="text-[11px] text-slate-500">{candidates.length} options evaluated</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {candidates.map((cand, idx) => {
                    const isSelected = selectedCandidateIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedCandidateIndex(idx)}
                        className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-950/40 text-white"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">{cand.label || cand.provider}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                            {cand.model}
                          </span>
                        </div>
                        <p className="text-[11px] line-clamp-2 text-slate-300 mt-1">
                          {cand.caption || "No caption generated"}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {candidates[selectedCandidateIndex] && (
                  <div className="p-4 rounded-md bg-slate-950 border border-slate-800 space-y-3">
                    <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {candidates[selectedCandidateIndex].caption}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => copyText(candidates[selectedCandidateIndex].caption, "caption")}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                      >
                        {copiedCaptionIdx === selectedCandidateIndex ? "Copied!" : "Copy Caption"}
                      </button>
                      <button
                        onClick={() => applyToEditor(candidates[selectedCandidateIndex].caption)}
                        className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                      >
                        Insert into Editor
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: SMART HASHTAGS                                     */}
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
                placeholder="Paste your post body or core keywords here..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleGenerateHashtags}
              disabled={tagLoading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{tagLoading ? "Analyzing Keywords…" : "Generate Smart Hashtags"}</span>
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
