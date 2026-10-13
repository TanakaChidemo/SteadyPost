"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { SparklesIcon, InstagramIcon, FacebookIcon, CheckIcon } from "./Icons";

export function AIModal({ onInsert, initialContent }) {
  const { isAiModalOpen, setAiModalOpen, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState("caption");

  // Caption generator state
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("casual");
  const [generatedCaption, setGeneratedCaption] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState(null);

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

  if (!isAiModalOpen) return null;

  async function handleGenerateCaption() {
    if (!topic.trim()) return addToast("error", "Please enter a topic or concept");
    setLoading(true);
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

      const firstSuccessIdx = rawCandidates.findIndex(
        (c) => c.status === "success" && c.caption
      );
      const chosenIdx = firstSuccessIdx >= 0 ? firstSuccessIdx : 0;
      setSelectedCandidateIndex(chosenIdx);
      setGeneratedCaption(rawCandidates[chosenIdx]?.caption || res.caption || "");
      addToast("success", "AI captions generated across models!");
    } catch (err) {
      addToast("error", err.message || "AI caption generation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text, idx) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    addToast("info", "Caption copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85">
      <div className="relative w-full max-w-5xl p-6 rounded-xl bg-slate-900 border border-slate-800 max-h-[92vh] overflow-y-auto shadow-2xl">
        <button
          onClick={() => setAiModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md gradient-brand flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Content Assistant</h2>
            <p className="text-xs text-slate-400">
              Generate and compare platform-tailored copy across Groq, OpenRouter & Gemini
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-md bg-slate-950 border border-slate-800 mb-5">
          <button
            onClick={() => setActiveTab("caption")}
            className={`flex-1 py-2 rounded text-xs font-semibold transition ${
              activeTab === "caption"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ✨ Multi-Model Caption Generator
          </button>
          <button
            onClick={() => setActiveTab("hashtags")}
            className={`flex-1 py-2 rounded text-xs font-semibold transition ${
              activeTab === "hashtags"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            # Smart Hashtags
          </button>
          <button
            onClick={() => setActiveTab("repurpose")}
            className={`flex-1 py-2 rounded text-xs font-semibold transition ${
              activeTab === "repurpose"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🔄 Multi-Platform Repurposer
          </button>
        </div>

        {/* Tab 1: Caption Generator */}
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
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="instagram">Instagram (Visual & Engaging)</option>
                  <option value="facebook">Facebook (Conversational & Community)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tone of Voice</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="casual">Casual & Approachable</option>
                  <option value="professional">Professional & Authoritative</option>
                  <option value="enthusiastic">Enthusiastic & High Energy</option>
                  <option value="witty">Witty & Humorous</option>
                  <option value="educational">Educational & Actionable</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateCaption}
              disabled={loading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{loading ? "Generating Across 3 LLM Providers..." : "Generate Captions with All 3 Models"}</span>
            </button>

            {candidates.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Compare & Choose Best Candidate
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Select your preferred generated copy below to apply it to your post draft.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-indigo-400">
                    {candidates.filter((c) => c.status === "success").length} of {candidates.length} models ready
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                    const wordCount = cand.caption ? cand.caption.split(/\s+/).filter(Boolean).length : 0;

                    return (
                      <div
                        key={cand.provider || idx}
                        onClick={() => {
                          if (isSuccess) {
                            setSelectedCandidateIndex(idx);
                            setGeneratedCaption(cand.caption);
                          }
                        }}
                        className={`flex flex-col justify-between p-4 rounded-lg border transition cursor-pointer ${
                          isSelected && isSuccess
                            ? "bg-slate-950 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg"
                            : isSuccess
                            ? "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                            : isUnconfigured
                            ? "bg-slate-950/30 border-slate-800/60 opacity-70 cursor-not-allowed"
                            : "bg-rose-950/10 border-rose-900/30 cursor-not-allowed"
                        }`}
                      >
                        <div>
                          {/* Header */}
                          <div className="flex items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-slate-800/80">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm">{providerTheme.icon}</span>
                              <span className="text-xs font-bold text-white truncate">
                                {cand.label || providerTheme.name}
                              </span>
                            </div>

                            {isSuccess && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                Ready
                              </span>
                            )}
                            {isUnconfigured && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                Unconfigured
                              </span>
                            )}
                            {cand.status === "error" && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                Error
                              </span>
                            )}
                          </div>

                          {/* Model info & metrics */}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                            <span className="truncate max-w-[140px] font-mono text-[10px] text-slate-500" title={cand.model}>
                              {cand.model}
                            </span>
                            {isSuccess && (
                              <span>
                                {wordCount} words • {charCount} chars
                              </span>
                            )}
                          </div>

                          {/* Body Content */}
                          {isSuccess && (
                            <div className="p-3 rounded bg-slate-900/80 border border-slate-800/80 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto mb-3">
                              {cand.caption}
                            </div>
                          )}

                          {isUnconfigured && (
                            <div className="p-3.5 rounded bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/80 space-y-1 mb-3">
                              <p className="font-semibold text-amber-300">API Key Not Configured</p>
                              <p className="text-[11px] text-slate-400">
                                Set <code className="text-amber-300 font-mono text-[10px]">{cand.provider.toUpperCase()}_API_KEY</code> in <code className="text-slate-300 font-mono text-[10px]">ai-service/.env</code> to enable this model.
                              </p>
                            </div>
                          )}

                          {cand.status === "error" && (
                            <div className="p-3.5 rounded bg-rose-500/5 border border-rose-500/20 text-xs text-rose-300 space-y-1 mb-3">
                              <p className="font-semibold">Generation Failed</p>
                              <p className="text-[11px] text-slate-400 break-words">{cand.error || "Provider error"}</p>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        {isSuccess && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCandidateIndex(idx);
                                  setGeneratedCaption(cand.caption);
                                }}
                                className={`flex-1 py-1.5 px-2 rounded text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
                                  isSelected
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {isSelected ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                                <span>{isSelected ? "Selected Choice" : "Choose Version"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(cand.caption, idx);
                                }}
                                className="py-1.5 px-2.5 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="Copy to clipboard"
                              >
                                {copiedIndex === idx ? "✓ Copied" : "Copy"}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApply(cand.caption);
                              }}
                              className="w-full py-1.5 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1"
                            >
                              <span>Apply to Post Draft ↵</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {candidates.some((c) => c.status === "success" && c.caption) && (
                  <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-indigo-200">
                      Currently Selected:{" "}
                      <span className="font-bold text-white">
                        {candidates[selectedCandidateIndex]?.label || "Candidate"} (
                        {candidates[selectedCandidateIndex]?.model || "model"})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApply(candidates[selectedCandidateIndex]?.caption || generatedCaption)}
                      className="px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-1.5"
                    >
                      <SparklesIcon className="w-4 h-4" />
                      <span>Apply Selected Version to Post Draft ↵</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Hashtag Generator */}
        {activeTab === "hashtags" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Post Text or Keywords
              </label>
              <textarea
                rows={3}
                value={tagContent}
                onChange={(e) => setTagContent(e.target.value)}
                placeholder="Paste your post body or core keywords here to extract relevant hashtags..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleGenerateHashtags}
              disabled={loading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{loading ? "Extracting Hashtags..." : "Generate Smart Hashtags"}</span>
            </button>

            {generatedTags.length > 0 && (
              <div className="p-4 rounded-md bg-slate-950 border border-indigo-500/40 space-y-3">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                  <span>Suggested Hashtags ({generatedTags.length})</span>
                  <button
                    onClick={() => handleApply(`\n\n${generatedTags.join("")}`)}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                  >
                    Append All to Draft
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {generatedTags.map((tag, i) => (
                    <span
                      key={i}
                      onClick={() => handleApply(` ${tag}`)}
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

        {/* Tab 3: Omni-Channel Repurposer */}
        {activeTab === "repurpose" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                This post was originally written for
              </label>
              <div className="flex gap-2">
                {["instagram", "facebook"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSourcePlatform(p)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-xs font-semibold capitalize transition ${
                      sourcePlatform === p
                        ? "border-indigo-500 bg-indigo-950/40 text-indigo-200"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p === "instagram" ? <InstagramIcon className="w-3.5 h-3.5" /> : <FacebookIcon className="w-3.5 h-3.5" />}
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Original Post Content
              </label>
              <textarea
                rows={3}
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="Paste the source post you want to adapt for the other platform..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleRepurpose}
              disabled={loading}
              className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{loading ? "Adapting Content..." : "Repurpose for the Other Platform"}</span>
            </button>

            {Object.keys(repurposedOutputs).length > 0 && (
              <div className="space-y-3 mt-4">
                {Object.entries(repurposedOutputs).map(([plt, text]) => (
                  <div key={plt} className="p-3.5 rounded-md bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="capitalize text-indigo-300 flex items-center gap-1.5">
                        {plt === "instagram" && <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />}
                        {plt === "facebook" && <FacebookIcon className="w-3.5 h-3.5 text-blue-500" />}
                        {plt}
                      </span>
                      <button
                        onClick={() => handleApply(text)}
                        className="px-2.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white text-[11px] transition"
                      >
                        Use this
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
