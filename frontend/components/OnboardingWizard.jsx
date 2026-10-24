"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ChipPicker, Field, LocationFields, inputClass } from "./ProfileFields";

const STEPS = [
  { id: "website", title: "Your website", intro: "Start with your website, if you have one. You can skip this." },
  { id: "business", title: "Your business", intro: "What you do and where — this shapes every post we suggest." },
  { id: "voice", title: "Audience & voice", intro: "Who you're talking to, and how you want to sound." },
  { id: "channels", title: "Your channels", intro: "Where you'll post. You can connect the accounts next." },
];

const EMPTY_VALUES = {
  name: "",
  businessType: "",
  websiteUrl: "",
  offer: "",
  audience: "",
  location: EMPTY_LOCATION,
  tone: ["professional"],
  goals: ["brand_awareness"],
  activeChannels: [],
};

function fromProfile(profile) {
  return {
    name: profile.name || "",
    businessType: profile.businessType === "General Venture" ? "" : profile.businessType || "",
    websiteUrl: profile.websiteUrl || "",
    offer: profile.offer || "",
    audience: profile.audience || "",
    location: { ...EMPTY_LOCATION, ...profile.location },
    tone: knownKeys(profile.tone, TONES).length ? knownKeys(profile.tone, TONES) : EMPTY_VALUES.tone,
    goals: knownKeys(profile.goals, GOALS).length ? knownKeys(profile.goals, GOALS) : EMPTY_VALUES.goals,
    activeChannels: knownKeys(profile.activeChannels, CHANNELS),
  };
}

/**
 * Fill in the fields the user hasn't, from `prefill` (e.g. details read from
 * their website in #04.1). Never replaces anything already entered.
 */
export function applyPrefill(values, prefill) {
  if (!prefill) return values;
  const next = { ...values, location: { ...values.location } };
  for (const key of ["name", "businessType", "websiteUrl", "offer", "audience"]) {
    if (!next[key].trim() && typeof prefill[key] === "string") next[key] = prefill[key];
  }
  for (const key of Object.keys(EMPTY_LOCATION)) {
    if (!next.location[key].trim() && typeof prefill.location?.[key] === "string") {
      next.location[key] = prefill.location[key];
    }
  }
  return next;
}

/**
 * Step-by-step onboarding (F01 #04). In "create" mode it creates a new
 * workspace with its profile; in "complete" mode it finishes the current
 * workspace's profile. `prefill` fills empty fields when the wizard opens.
 */
export function OnboardingWizard({ prefill = null }) {
  const router = useRouter();
  const {
    onboarding,
    currentWorkspace,
    socialAccounts,
    closeOnboarding,
    dismissOnboarding,
    fetchWorkspaces,
    switchWorkspace,
    addToast,
  } = useAppStore();
  const mode = onboarding?.mode;
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;

  const [step, setStep] = useState(0);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mode) return;
    let mounted = true;
    setStep(0);
    setError("");

    if (mode === "create") {
      setValues(applyPrefill(EMPTY_VALUES, prefill));
      return;
    }

    setLoading(true);
    api.businessProfile
      .get()
      .then((profile) => mounted && setValues(applyPrefill(fromProfile(profile), prefill)))
      .catch(() => mounted && setValues(applyPrefill(EMPTY_VALUES, prefill)))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [mode, workspaceId, prefill]);

  if (!mode) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const set = (key) => (value) => {
    setError("");
    setValues((v) => ({ ...v, [key]: value }));
  };
  const setText = (key) => (e) => set(key)(e.target.value);
  const connected = new Set(mode === "complete" ? socialAccounts.map((a) => a.platform) : []);

  function close() {
    if (mode === "complete" && workspaceId) dismissOnboarding(workspaceId);
    else closeOnboarding();
  }

  function next(e) {
    e.preventDefault();
    setError("");
    if (current.id === "business" && !values.name.trim()) {
      setError("Please enter your business name.");
      return;
    }
    if (isLast) finish(false);
    else setStep(step + 1);
  }

  async function finish(goToAccounts) {
    const payload = {
      ...values,
      name: values.name.trim(),
      websiteUrl: normaliseWebsiteUrl(values.websiteUrl),
      onboardingCompleted: true,
    };

    try {
      setSaving(true);
      if (mode === "create") {
        const res = await api.workspaces.create(payload);
        await fetchWorkspaces();
        if (res.workspace?.id) await switchWorkspace(res.workspace.id);
      } else {
        await api.businessProfile.update(payload);
        await fetchWorkspaces();
      }
      addToast("success", `${payload.name} is set up`);
      closeOnboarding();
      // Channel setup hook: #08 (F27) replaces this with its step-by-step
      // channel-connection walkthrough.
      if (goToAccounts) router.push("/dashboard/accounts");
    } catch (err) {
      setError(profileErrorMessage(err, "Couldn't save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full sm:max-w-xl flex flex-col bg-slate-950 sm:rounded-2xl border-slate-800 sm:border shadow-2xl max-h-full"
      >
        {/* Header with progress */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                {mode === "create" ? "New business profile" : "Set up your business"} · Step {step + 1} of{" "}
                {STEPS.length}
              </p>
              <h2 id="onboarding-title" className="text-lg sm:text-base font-bold text-white mt-1">
                {current.title}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{current.intro}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-slate-900 transition"
            >
              {mode === "create" ? "Cancel" : "Finish later"}
            </button>
          </div>
          <div className="flex gap-1.5 mt-4" aria-hidden="true">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-indigo-500" : "bg-slate-800"}`} />
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 py-16 text-center text-xs text-slate-500 animate-pulse">Loading your profile...</div>
        ) : (
          <form onSubmit={next} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
              {current.id === "website" && (
                <Field label="Website" hint="Your shop, landing page or company site. Leave it blank if you don't have one.">
                  <input
                    {...websiteInputProps}
                    autoFocus
                    placeholder="e.g. mybusiness.com"
                    value={values.websiteUrl}
                    onChange={setText("websiteUrl")}
                    className={inputClass}
                  />
                </Field>
              )}

              {current.id === "business" && (
                <>
                  <Field label="Business name *" hint="Shown in the profile menu at the top of the app.">
                    <input
                      type="text"
                      autoFocus
                      autoComplete="organization"
                      maxLength={LIMITS.name}
                      placeholder="e.g. Rosie's Bakery"
                      value={values.name}
                      onChange={setText("name")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Type of business">
                    <input
                      type="text"
                      maxLength={LIMITS.businessType}
                      placeholder="e.g. Bakery, Barber, Online shop"
                      value={values.businessType}
                      onChange={setText("businessType")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="What you offer">
                    <textarea
                      rows={3}
                      maxLength={LIMITS.offer}
                      placeholder="e.g. Celebration cakes and fresh sourdough, baked every morning."
                      value={values.offer}
                      onChange={setText("offer")}
                      className={inputClass}
                    />
                  </Field>
                  <LocationFields value={values.location} onChange={set("location")} />
                </>
              )}

              {current.id === "voice" && (
                <>
                  <Field label="Who are your customers?">
                    <input
                      type="text"
                      autoFocus
                      maxLength={LIMITS.audience}
                      placeholder="e.g. Local families, students, small businesses"
                      value={values.audience}
                      onChange={setText("audience")}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="How should your posts sound?" hint="Pick one or more. The first one leads.">
                    <ChipPicker options={TONES} selected={values.tone} onChange={set("tone")} />
                  </Field>
                  <Field label="What do you want from social media?">
                    <ChipPicker
                      options={GOALS}
                      selected={values.goals}
                      onChange={set("goals")}
                      activeClass="bg-purple-600 text-white"
                    />
                  </Field>
                </>
              )}

              {current.id === "channels" && (
                <Field label="Where will you post?" hint="Choose the channels you plan to use.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CHANNELS.map(({ key, label }) => {
                      const selected = values.activeChannels.includes(key);
                      return (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={selected}
                          onClick={() =>
                            set("activeChannels")(
                              selected
                                ? values.activeChannels.filter((c) => c !== key)
                                : [...values.activeChannels, key]
                            )
                          }
                          className={`flex items-center justify-between px-3 py-3 rounded-lg border text-sm sm:text-xs transition ${
                            selected
                              ? "border-indigo-500 bg-indigo-600/15 text-white"
                              : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <span className="font-medium">{label}</span>
                          <span className="text-[11px] text-slate-400">
                            {connected.has(key) ? "Connected" : selected ? "Selected" : "Not used"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              {error && (
                <p role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 sm:px-6 py-4 border-t border-slate-800/80 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={step === 0 || saving}
                className="px-4 py-2.5 sm:py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-900 transition disabled:invisible"
              >
                ← Back
              </button>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                {current.id === "website" && (
                  <button
                    type="button"
                    onClick={() => {
                      set("websiteUrl")("");
                      setStep(1);
                    }}
                    className="px-4 py-2.5 sm:py-2 rounded-lg border border-slate-800 text-xs text-slate-300 hover:bg-slate-900 transition"
                  >
                    I don&apos;t have one
                  </button>
                )}
                {isLast && values.activeChannels.some((c) => !connected.has(c)) && (
                  <button
                    type="button"
                    onClick={() => finish(true)}
                    disabled={saving}
                    className="px-4 py-2.5 sm:py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-xs font-medium hover:bg-indigo-500/20 transition disabled:opacity-50"
                  >
                    Finish & connect accounts
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 sm:py-2 rounded-lg gradient-brand text-xs font-semibold text-white hover:opacity-95 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : isLast ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
