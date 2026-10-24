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
import { nameSuggestion, websiteReadError } from "../lib/websitePrefill";
import { ChipPicker, Field, LocationFields, NameSuggestion, inputClass } from "./ProfileFields";

/** Edits the current workspace's profile. New profiles go through the onboarding wizard. */
export function BusinessProfileModal() {
  const { isBusinessProfileOpen, setBusinessProfileOpen, currentWorkspace, fetchWorkspaces, openOnboarding, addToast } =
    useAppStore();

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
        api.website
          .connect(url)
          .catch((err) =>
            addToast("info", `Saved, but we couldn't read your website: ${websiteReadError(err)}`)
          );
      }
    } catch (err) {
      addToast("error", profileErrorMessage(err, "Failed to update profile"));
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
      </div>
    </div>
  );
}
