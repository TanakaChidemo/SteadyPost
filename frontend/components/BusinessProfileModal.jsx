"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { normaliseWebsiteUrl, websiteInputProps } from "../lib/websiteUrl";
import {
  CHANNELS,
  EMPTY_LOCATION,
  GOALS,
  LIMITS,
  TONES,
  knownKeys,
  profileErrorMessage,
} from "../lib/profileOptions";
import { isWebsiteAsleep, nameSuggestion, websiteReadError } from "../lib/websitePrefill";
import { ChipPicker, Field, LocationFields, NameSuggestion, inputClass } from "./ProfileFields";

/**
 * Reads a saved website into the workspace's connection (#03.1). The profile is
 * already saved, so a failure only warns, and a site that timed out (likely
 * asleep) gets a Try again button.
 */
function readSavedWebsite(url, workspaceId, addToast, isRetry = false) {
  api.website
    .connect(url, workspaceId)
    .then(() => isRetry && addToast("success", "Read your website"))
    .catch((err) => {
      if (isWebsiteAsleep(err)) {
        addToast("info", "Saved, but your website took too long to respond. It may have been asleep.", {
          label: "Try again",
          onClick: () => readSavedWebsite(url, workspaceId, addToast, true),
        });
      } else {
        addToast("info", `Saved, but we couldn't read your website: ${websiteReadError(err)}`);
      }
    });
}

/** Edits the current workspace's profile. New profiles go through the onboarding wizard. */
export function BusinessProfileModal() {
  const {
    isBusinessProfileOpen,
    setBusinessProfileOpen,
    currentWorkspace,
    workspaces,
    fetchWorkspaces,
    openOnboarding,
    addToast,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "notifications"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile Fields
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [location, setLocation] = useState(EMPTY_LOCATION);
  const [selectedTones, setSelectedTones] = useState(["professional"]);
  const [selectedGoals, setSelectedGoals] = useState(["brand_awareness"]);
  const [activeChannels, setActiveChannels] = useState([]);
  // The website as last saved, and the name it gives (#04.1).
  const [savedWebsiteUrl, setSavedWebsiteUrl] = useState("");
  const [websiteName, setWebsiteName] = useState(null);

  // Notification Settings
  const [dailyCap, setDailyCap] = useState(5);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");

  // Guardrail Settings (F09)
  const [bannedClaimsInput, setBannedClaimsInput] = useState("");
  const [requiredDisclosuresInput, setRequiredDisclosuresInput] = useState("");
  const [toneStrictness, setToneStrictness] = useState("moderate");
  const [sensitivityLevel, setSensitivityLevel] = useState("standard");

  // Interactive Live Tester state
  const [testDraftText, setTestDraftText] = useState("");
  const [draftTestResult, setDraftTestResult] = useState(null);
  const [testingDraft, setTestingDraft] = useState(false);

  const [testTrendTopic, setTestTrendTopic] = useState("");
  const [testTrendSnippet, setTestTrendSnippet] = useState("");
  const [trendTestResult, setTrendTestResult] = useState(null);
  const [testingTrend, setTestingTrend] = useState(false);

  useEffect(() => {
    if (!isBusinessProfileOpen || !currentWorkspace) return;

    let mounted = true;
    setLoading(true);

    Promise.all([
      api.businessProfile.get().catch(() => null),
      api.businessProfile.getNotifications().catch(() => null),
      api.website.getConnection().catch(() => null),
    ])
      .then(([prof, notif, connection]) => {
        if (!mounted) return;
        setWebsiteName(connection?.fields?.name || null);
        if (prof) {
          setSavedWebsiteUrl(normaliseWebsiteUrl(prof.websiteUrl || ""));
          setName(prof.name || currentWorkspace?.name || "");
          setBusinessType(prof.businessType || "");
          setWebsiteUrl(prof.websiteUrl || currentWorkspace?.websiteUrl || "");
          setOffer(prof.offer || "");
          setAudience(prof.audience || "");
          setLocation({ ...EMPTY_LOCATION, ...prof.location });
          const tones = knownKeys(prof.tone, TONES);
          const goals = knownKeys(prof.goals, GOALS);
          setSelectedTones(tones.length > 0 ? tones : ["professional"]);
          setSelectedGoals(goals.length > 0 ? goals : ["brand_awareness"]);
          setActiveChannels(knownKeys(prof.activeChannels, CHANNELS));
          if (prof.guardrails) {
            setBannedClaimsInput((prof.guardrails.bannedClaims || []).join(", "));
            setRequiredDisclosuresInput((prof.guardrails.requiredDisclosures || []).join(", "));
            setToneStrictness(prof.guardrails.toneStrictness || "moderate");
            setSensitivityLevel(prof.guardrails.sensitivitySensitivity || "standard");
          }
        }
        if (notif) {
          setDailyCap(notif.dailyCap || 5);
          setQuietHoursEnabled(Boolean(notif.quietHours?.enabled));
          setQuietStart(notif.quietHours?.start || "22:00");
          setQuietEnd(notif.quietHours?.end || "08:00");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isBusinessProfileOpen, currentWorkspace]);

  if (!isBusinessProfileOpen) return null;

  async function handleRunDraftTest(textToTest) {
    const text = textToTest !== undefined ? textToTest : testDraftText;
    if (!text.trim()) return addToast("info", "Please enter text to test");
    setTestingDraft(true);
    try {
      const res = await api.guardrails.checkDraft({ content: text });
      setDraftTestResult(res);
      addToast("success", `Guardrails evaluated: Score ${res.score}/100`);
    } catch (err) {
      addToast("error", err.message || "Guardrail check failed");
    } finally {
      setTestingDraft(false);
    }
  }

  async function handleRunTrendTest(topicToTest, snippetToTest) {
    const topic = topicToTest !== undefined ? topicToTest : testTrendTopic;
    const snippet = snippetToTest !== undefined ? snippetToTest : testTrendSnippet;
    if (!topic.trim()) return addToast("info", "Please enter a trend topic to screen");
    setTestingTrend(true);
    try {
      const res = await api.guardrails.checkTrend({ topic, snippet });
      setTrendTestResult(res);
      if (res.isSensitive) {
        addToast("info", "Sensitivity Filter: Topic BLOCKED as high-risk/sensitive.");
      } else {
        addToast("success", "Sensitivity Filter: Topic PASSED (safe for drafting).");
      }
    } catch (err) {
      addToast("error", err.message || "Trend screening failed");
    } finally {
      setTestingTrend(false);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();

    try {
      setSaving(true);
      await api.businessProfile.update({
        name: name.trim() || undefined,
        businessType: businessType.trim(),
        websiteUrl: normaliseWebsiteUrl(websiteUrl),
        offer: offer.trim(),
        audience: audience.trim(),
        location,
        tone: selectedTones,
        goals: selectedGoals,
        activeChannels,
        guardrails: {
          bannedClaims: bannedClaimsInput.split(",").map((s) => s.trim()).filter(Boolean),
          requiredDisclosures: requiredDisclosuresInput.split(",").map((s) => s.trim()).filter(Boolean),
          toneStrictness,
          sensitivitySensitivity: sensitivityLevel,
        },
      });

      await api.businessProfile.updateNotifications({
        dailyCap: Number(dailyCap),
        quietHours: {
          enabled: quietHoursEnabled,
          start: quietStart,
          end: quietEnd,
        },
      });

      await fetchWorkspaces();
      addToast("success", "Business profile & settings saved!");
      setBusinessProfileOpen(false);

      // Read a new or changed website so the workspace's connection (#03.1)
      // stays current. The profile is already saved, so a failure only warns.
      const url = normaliseWebsiteUrl(websiteUrl);
      if (url && url !== savedWebsiteUrl) {
        readSavedWebsite(url, currentWorkspace.id || currentWorkspace._id, addToast);
      }
    } catch (err) {
      addToast("error", profileErrorMessage(err, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      {/* m-auto rather than items-center: centred when it fits, scrollable from the top when it doesn't */}
      <div className="m-auto w-full max-w-xl rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏢</span>
              <h2 className="text-base font-bold text-white">
                {`${name || currentWorkspace?.name || "Business"} Profile`}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Configures AI generation tone, relevance scoring, and notification budget.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openOnboarding("create")}
              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition flex items-center gap-1"
              title="Create an additional business profile"
            >
              <span>+</span>
              <span>New Profile</span>
            </button>
            <button
              onClick={() => setBusinessProfileOpen(false)}
              className="w-8 h-8 rounded-lg border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center hover:bg-slate-900 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b border-slate-800/80 pb-3 mb-5">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "profile"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Brand & Audience Context
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "notifications"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Notification Budget
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("guardrails")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "guardrails"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Brand Guardrails (F09)
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
            Loading business profile...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {activeTab === "profile" && (
              <>
                <Field label="Profile / Business Name *" hint="This is the label displayed in your top dropdown menu.">
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.name}
                    placeholder="e.g. Apex Apparel, SteadyPost Marketing, Gen Venture"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                  {nameSuggestion(name, websiteName) && (
                    <NameSuggestion name={nameSuggestion(name, websiteName)} onUse={() => setName(websiteName.trim())} />
                  )}
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Business Type / Industry">
                    <input
                      type="text"
                      maxLength={LIMITS.businessType}
                      placeholder="e.g. AI SaaS, Bakery, Marketing Agency"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Target Audience">
                    <input
                      type="text"
                      maxLength={LIMITS.audience}
                      placeholder="e.g. Founders, Local customers, Gen-Z"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field
                  label="Website / Business URL"
                  hint="Links this profile to your online store, landing page, or company website."
                >
                  <input
                    {...websiteInputProps}
                    placeholder="e.g. mybusiness.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field label="Core Offer / Value Proposition">
                  <textarea
                    rows={2}
                    maxLength={LIMITS.offer}
                    placeholder="e.g. Automated social scheduling and AI copywriting tools for creators."
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <LocationFields value={location} onChange={setLocation} />

                <Field label="Brand Tones (Feeds AI Caption Generator)">
                  <ChipPicker options={TONES} selected={selectedTones} onChange={setSelectedTones} />
                </Field>

                <Field label="Marketing Goals">
                  <ChipPicker
                    options={GOALS}
                    selected={selectedGoals}
                    onChange={setSelectedGoals}
                    activeClass="bg-purple-600 text-white"
                  />
                </Field>

                <Field label="Active Channels" hint="The channels this profile posts to.">
                  <ChipPicker options={CHANNELS} selected={activeChannels} onChange={setActiveChannels} />
                </Field>
              </>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Daily Notification Cap
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enforces maximum suggestions/nudges sent for this profile per day.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Quiet Hours</div>
                      <p className="text-[11px] text-slate-400">
                        Suppress bot suggestions and alert nudges during off-hours.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={quietHoursEnabled}
                      onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-800"
                    />
                  </div>

                  {quietHoursEnabled && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={quietStart}
                          onChange={(e) => setQuietStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">End Time</label>
                        <input
                          type="time"
                          value={quietEnd}
                          onChange={(e) => setQuietEnd(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "guardrails" && (
              <div className="space-y-6">
                {/* Section 1: Brand Guardrail Settings */}
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Workspace Guardrail Rules
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Configure automated checks for tone alignment, prohibited claims, and mandatory disclosures.
                    </p>
                  </div>

                  <Field
                    label="Banned Claims / Prohibited Phrases"
                    hint="Separate claims with commas. E.g.: cheapest in town, miracle cure, 100% guaranteed"
                  >
                    <input
                      type="text"
                      placeholder="e.g. miracle cure, cheapest in town, instant riches"
                      value={bannedClaimsInput}
                      onChange={(e) => setBannedClaimsInput(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field
                    label="Mandatory Required Disclosures"
                    hint="Disclosures enforced for promotional posts. Separate with commas. E.g.: #ad, #sponsored, Results may vary"
                  >
                    <input
                      type="text"
                      placeholder="e.g. #ad, #sponsored, Past performance does not guarantee future results"
                      value={requiredDisclosuresInput}
                      onChange={(e) => setRequiredDisclosuresInput(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Tone Strictness</label>
                      <select
                        value={toneStrictness}
                        onChange={(e) => setToneStrictness(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                      >
                        <option value="moderate">Moderate (Balanced evaluation)</option>
                        <option value="strict">Strict (High brand fidelity)</option>
                        <option value="relaxed">Relaxed (Flexible styling)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Trend Sensitivity Screening</label>
                      <select
                        value={sensitivityLevel}
                        onChange={(e) => setSensitivityLevel(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                      >
                        <option value="standard">Standard (Disasters, tragedies, crises)</option>
                        <option value="conservative">Conservative (Extra precautionary)</option>
                        <option value="relaxed">Relaxed (Severe crises only)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Interactive Live Tester */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400">🛡️</span>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Live Guardrail Tester</h4>
                      </div>
                      <p className="text-[11px] text-slate-400">Test draft copy or trend headlines live against active workspace rules.</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      Human in Loop: Mandatory
                    </span>
                  </div>

                  {/* Draft Check Sub-tool */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-300">1. Test Draft Post Copy</label>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="text-[10px] text-slate-400 self-center">Presets:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = "Try our miracle cure for guaranteed 100% return! Use code SAVE20.";
                          setTestDraftText(sample);
                          handleRunDraftTest(sample);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        🚨 Miracle Cure & Missing #ad
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = "Excited to partner on scalable AI workflows for high-growth teams. #ad";
                          setTestDraftText(sample);
                          handleRunDraftTest(sample);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        ✅ Clean Copy with #ad
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = "Shut up you idiots and buy this product immediately!";
                          setTestDraftText(sample);
                          handleRunDraftTest(sample);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        ⚠️ Hostile Tone
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={testDraftText}
                        onChange={(e) => setTestDraftText(e.target.value)}
                        placeholder="Type post copy to audit tone, banned claims, and required disclosures..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={testingDraft}
                        onClick={() => handleRunDraftTest()}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold self-end disabled:opacity-50 transition"
                      >
                        {testingDraft ? "Auditing..." : "Audit Copy"}
                      </button>
                    </div>

                    {draftTestResult && (
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">Audit Result:</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              draftTestResult.passed
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            Score: {draftTestResult.score}/100 — {draftTestResult.passed ? "PASSED" : "VIOLATIONS DETECTED"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400">Tone Match:</span>{" "}
                            <span className={draftTestResult.tone?.passed ? "text-emerald-400" : "text-amber-400"}>
                              {draftTestResult.tone?.passed ? "✓ Matches" : "✗ Diverges"} ({draftTestResult.tone?.detectedTone || "neutral"})
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Banned Claims:</span>{" "}
                            <span className={draftTestResult.bannedClaims?.passed ? "text-emerald-400" : "text-rose-400"}>
                              {draftTestResult.bannedClaims?.passed ? "✓ Clear" : `✗ Flagged (${draftTestResult.bannedClaims?.violations?.length})`}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Disclosures:</span>{" "}
                            <span className={draftTestResult.disclosures?.passed ? "text-emerald-400" : "text-amber-400"}>
                              {draftTestResult.disclosures?.passed ? "✓ Clear" : `✗ Missing (${draftTestResult.disclosures?.missing?.length})`}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Human Approval:</span>{" "}
                            <span className="text-indigo-400 font-semibold">Strictly Mandatory</span>
                          </div>
                        </div>

                        {draftTestResult.violations?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                            {draftTestResult.violations.map((v, i) => (
                              <div key={i} className="text-[11px] text-rose-300 flex items-start gap-1.5">
                                <span>•</span>
                                <span>{v.message || v.reason || v.phrase || "Policy violation"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Trend Sensitivity Screening Sub-tool */}
                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      2. Pre-Draft Trend Sensitivity Filter (#24 Assistant)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="text-[10px] text-slate-400 self-center">Presets:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const topic = "Deadly 7.8 magnitude earthquake strikes eastern province";
                          const snip = "Emergency teams search collapsed buildings as death toll rises past 400.";
                          setTestTrendTopic(topic);
                          setTestTrendSnippet(snip);
                          handleRunTrendTest(topic, snip);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        🌪️ Deadly Earthquake
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const topic = "Commercial flight crashes in mountainous terrain with zero survivors";
                          const snip = "Search and rescue locates wreckage after fatal crash.";
                          setTestTrendTopic(topic);
                          setTestTrendSnippet(snip);
                          handleRunTrendTest(topic, snip);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        ✈️ Plane Crash Disaster
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const topic = "This new productivity app is completely killing it on ProductHunt";
                          const snip = "Founders share their journey to 10k daily users.";
                          setTestTrendTopic(topic);
                          setTestTrendSnippet(snip);
                          handleRunTrendTest(topic, snip);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition"
                      >
                        🚀 Safe: App &quot;Killing It&quot;
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={testTrendTopic}
                        onChange={(e) => setTestTrendTopic(e.target.value)}
                        placeholder="Trend headline / topic..."
                        className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={testTrendSnippet}
                          onChange={(e) => setTestTrendSnippet(e.target.value)}
                          placeholder="Snippet / news context..."
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={testingTrend}
                          onClick={() => handleRunTrendTest()}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition"
                        >
                          {testingTrend ? "Screening..." : "Screen Trend"}
                        </button>
                      </div>
                    </div>

                    {trendTestResult && (
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300">Screening Result:</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              trendTestResult.isSensitive
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {trendTestResult.isSensitive ? "BLOCKED: SENSITIVE / TRAGEDY" : "PASSED: SAFE FOR DRAFTING"}
                          </span>
                        </div>
                        {trendTestResult.isSensitive ? (
                          <div className="text-[11px] text-rose-300">
                            <strong>Reason:</strong> {trendTestResult.reason} (Category: {trendTestResult.category})
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-400">
                            ✓ No sensitive tragedy or controversy detected. Pre-draft check cleared.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800/80 mt-6">
              <button
                type="button"
                onClick={() => setBusinessProfileOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 hover:bg-slate-900 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg gradient-brand text-xs font-semibold text-white hover:opacity-95 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        )}

        {!loading && activeTab === "profile" && currentWorkspace?.role === "owner" && (
          <ArchiveWorkspace
            key={currentWorkspace.id || currentWorkspace._id}
            workspaceName={currentWorkspace.name}
            isOnlyWorkspace={workspaces.length <= 1}
            onArchived={() => setBusinessProfileOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Owner-only. Archiving hides the workspace from everyone but keeps its data;
 * the owner confirms by typing its name, and can't archive their only one.
 */
function ArchiveWorkspace({ workspaceName, isOnlyWorkspace, onArchived }) {
  const archiveWorkspace = useAppStore((state) => state.archiveWorkspace);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");

  const nameMatches = typed.trim() === (workspaceName || "").trim();

  async function handleArchive() {
    if (!nameMatches || archiving) return;
    try {
      setArchiving(true);
      setError("");
      await archiveWorkspace();
      onArchived();
    } catch (err) {
      setError(profileErrorMessage(err, "Couldn't archive this workspace"));
      setArchiving(false);
    }
  }

  return (
    <div className="mt-6 pt-4 border-t border-red-500/20">
      <div className="text-xs font-semibold text-red-300">Archive this workspace</div>
      <p className="text-[11px] text-slate-400 mt-0.5">
        It disappears from the profile list for everyone in it and can&apos;t be opened. Its posts, linked
        accounts and settings are kept, not deleted.
      </p>

      {isOnlyWorkspace && (
        <p className="text-[11px] text-slate-500 mt-2">
          You can&apos;t archive your only workspace. Create another one first.
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          disabled={isOnlyWorkspace}
          onClick={() => setConfirming(true)}
          className="mt-3 px-4 py-2 rounded-lg border border-red-500/40 text-xs font-semibold text-red-300 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Archive this Workspace
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label htmlFor="archive-confirm" className="block text-[11px] text-slate-300">
            Type <span className="font-semibold text-white">{workspaceName}</span> to confirm.
          </label>
          <input
            id="archive-confirm"
            type="text"
            autoFocus
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleArchive()}
            className={inputClass}
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError("");
              }}
              className="px-4 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 hover:bg-slate-900 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!nameMatches || archiving}
              onClick={handleArchive}
              className="px-4 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {archiving ? "Archiving..." : "Archive this Workspace"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
