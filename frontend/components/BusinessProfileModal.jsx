"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";

const PRESET_TONES = ["Professional", "Inspiring", "Tech-Forward", "Casual", "Authoritative", "Bold", "Playful"];
const PRESET_GOALS = ["Brand Awareness", "Lead Generation", "Community Growth", "Thought Leadership"];

export function BusinessProfileModal() {
  const {
    isBusinessProfileOpen,
    setBusinessProfileOpen,
    currentWorkspace,
    fetchWorkspaces,
    switchWorkspace,
    addToast,
  } = useAppStore();

  const [isNewMode, setIsNewMode] = useState(false);
  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "notifications"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile Fields
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [selectedTones, setSelectedTones] = useState(["professional"]);
  const [selectedGoals, setSelectedGoals] = useState(["brand_awareness"]);

  // Notification Settings
  const [dailyCap, setDailyCap] = useState(5);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");

  useEffect(() => {
    if (!isBusinessProfileOpen || !currentWorkspace) return;

    let mounted = true;
    setLoading(true);
    setIsNewMode(false);

    Promise.all([
      api.businessProfile.get().catch(() => null),
      api.businessProfile.getNotifications().catch(() => null),
    ])
      .then(([prof, notif]) => {
        if (!mounted) return;
        if (prof) {
          setName(prof.name || currentWorkspace?.name || "");
          setBusinessType(prof.businessType || "");
          setWebsiteUrl(prof.websiteUrl || currentWorkspace?.websiteUrl || "");
          setOffer(prof.offer || "");
          setAudience(prof.audience || "");
          setSelectedTones(prof.tone && prof.tone.length > 0 ? prof.tone : ["professional"]);
          setSelectedGoals(prof.goals && prof.goals.length > 0 ? prof.goals : ["brand_awareness"]);
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

  function toggleTone(tone) {
    const lower = tone.toLowerCase();
    if (selectedTones.includes(lower)) {
      setSelectedTones(selectedTones.filter((t) => t !== lower));
    } else {
      setSelectedTones([...selectedTones, lower]);
    }
  }

  function toggleGoal(goal) {
    const key = goal.toLowerCase().replace(/\s+/g, "_");
    if (selectedGoals.includes(key)) {
      setSelectedGoals(selectedGoals.filter((g) => g !== key));
    } else {
      setSelectedGoals([...selectedGoals, key]);
    }
  }

  function switchToNewMode() {
    setIsNewMode(true);
    setName("");
    setBusinessType("");
    setWebsiteUrl("");
    setOffer("");
    setAudience("");
    setSelectedTones(["professional"]);
    setSelectedGoals(["brand_awareness"]);
    setActiveTab("profile");
  }

  function switchToEditMode() {
    setIsNewMode(false);
    if (currentWorkspace) {
      setName(currentWorkspace.name || "");
      setBusinessType(currentWorkspace.businessType || "");
      setWebsiteUrl(currentWorkspace.websiteUrl || "");
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    if (isNewMode) {
      return handleCreateNewProfile();
    }

    try {
      setSaving(true);
      await api.businessProfile.update({
        name: name.trim() || undefined,
        businessType: businessType.trim(),
        websiteUrl: websiteUrl.trim(),
        offer: offer.trim(),
        audience: audience.trim(),
        tone: selectedTones,
        goals: selectedGoals,
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
    } catch (err) {
      addToast("error", err.response?.data?.error || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNewProfile() {
    const profileName = name.trim() || businessType.trim();
    if (!profileName) {
      addToast("error", "Please enter a Profile Name or Business Type");
      return;
    }

    try {
      setSaving(true);
      const res = await api.workspaces.create({
        name: profileName,
        businessType: businessType.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        offer: offer.trim() || undefined,
        audience: audience.trim() || undefined,
        tone: selectedTones,
        goals: selectedGoals,
      });

      await fetchWorkspaces();
      if (res.workspace?.id) {
        await switchWorkspace(res.workspace.id);
      }

      addToast("success", `Created new profile "${profileName}"!`);
      setBusinessProfileOpen(false);
    } catch (err) {
      addToast("error", err.response?.data?.error || "Failed to create business profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏢</span>
              <h2 className="text-base font-bold text-white">
                {isNewMode
                  ? "Create New Business Profile"
                  : `${name || currentWorkspace?.name || "Business"} Profile`}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isNewMode
                ? "Set up a new venture with isolated social channels, calendar, and AI brand voice."
                : "Configures AI generation tone, relevance scoring, and notification budget."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isNewMode ? (
              <button
                type="button"
                onClick={switchToNewMode}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition flex items-center gap-1"
                title="Create an additional business profile"
              >
                <span>+</span>
                <span>New Profile</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={switchToEditMode}
                className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white transition"
              >
                ← Back to Current
              </button>
            )}
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
          {!isNewMode && (
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
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
            Loading business profile...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {activeTab === "profile" && (
              <>
                {/* Profile Name Field */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Profile / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Apparel, SteadyPost Marketing, Gen Venture"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    This is the label displayed in your top dropdown menu.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Business Type / Industry
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. AI SaaS, Bakery, Marketing Agency"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Founders, Local customers, Gen-Z"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Website / Business URL
                  </label>
                  <input
                    type="url"
                    placeholder="e.g. https://mybusiness.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Links this profile to your online store, landing page, or company website.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Core Offer / Value Proposition
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Automated social scheduling and AI copywriting tools for creators."
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Brand Tones (Feeds AI Caption Generator)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TONES.map((tone) => {
                      const lower = tone.toLowerCase();
                      const isSelected = selectedTones.includes(lower);
                      return (
                        <button
                          type="button"
                          key={tone}
                          onClick={() => toggleTone(tone)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Marketing Goals
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_GOALS.map((goal) => {
                      const key = goal.toLowerCase().replace(/\s+/g, "_");
                      const isSelected = selectedGoals.includes(key);
                      return (
                        <button
                          type="button"
                          key={goal}
                          onClick={() => toggleGoal(goal)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                            isSelected
                              ? "bg-purple-600 text-white"
                              : "bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {goal}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {activeTab === "notifications" && !isNewMode && (
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

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80 mt-6">
              {!isNewMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleCreateNewProfile}
                    disabled={saving}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-medium transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <span>+</span>
                    <span>Create as New Profile</span>
                  </button>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
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
                </>
              ) : (
                <div className="flex items-center justify-end gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={() => setIsNewMode(false)}
                    className="px-4 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 hover:bg-slate-900 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || (!name.trim() && !businessType.trim())}
                    className="px-5 py-2 rounded-lg gradient-brand text-xs font-semibold text-white hover:opacity-95 transition disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create Profile"}
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
