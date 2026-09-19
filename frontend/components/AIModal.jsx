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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85">
      <div className="relative w-full max-w-2xl p-6 rounded-lg bg-slate-900 border border-slate-800 max-h-[90vh] overflow-y-auto">
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
              Generate platform-tailored copy, high-ranking hashtags & omni-channel adaptations
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
            ✨ Generate Caption
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
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {topic ? "Your post (edit to redirect the AI)" : "What is your post about?"}
              </label>
              <textarea
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Announcing our 2026 AI Product Roadmap with automated scheduler & instant analytics..."
                className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <span>{loading ? "Generating Copy..." : "Generate AI Caption"}</span>
            </button>

            {generatedCaption && (
              <div className="p-4 rounded-md bg-slate-950 border border-indigo-500/40 space-y-3">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                  <span>Generated AI Output:</span>
                  <button
                    onClick={() => handleApply(generatedCaption)}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                  >
                    Apply to Post Draft ↵
                  </button>
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {generatedCaption}
                </p>
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
