"use client";

import React, { useState, useEffect } from "react";
import defaultWalkthroughData from "../lib/channelWalkthroughs.json";
import { api } from "../lib/apiClient";
import {
  FacebookIcon,
  InstagramIcon,
  GoogleIcon,
  LinkedInIcon,
  TwitterIcon,
  CheckIcon,
  ArrowUpRightIcon,
} from "./Icons";

const PLATFORM_ORDER = ["facebook", "instagram", "gbp", "linkedin", "twitter"];

const PLATFORM_ICONS = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  gbp: GoogleIcon,
  linkedin: LinkedInIcon,
  twitter: TwitterIcon,
};

const PLATFORM_STYLES = {
  facebook: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  instagram: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  gbp: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  linkedin: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  twitter: "text-slate-200 bg-slate-500/10 border-slate-500/30",
};

export function SetupWalkthroughModal({
  isOpen,
  onClose,
  initialPlatform = "facebook",
  activeBlocker = null,
  progressByPlatform = {},
  onProgressUpdated,
  onRetryConnect,
  onUseSandbox,
  canManage = true,
  viewerRole = "owner",
}) {
  const [guides, setGuides] = useState(defaultWalkthroughData.platforms);
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatform || "facebook");
  const [activeStep, setActiveStep] = useState(1);
  const [savingStep, setSavingStep] = useState(false);
  const [checkingAgain, setCheckingAgain] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    api.channelSetup
      .getGuides()
      .then((data) => {
        if (data?.platforms) setGuides(data.platforms);
      })
      .catch(() => {});
  }, [isOpen]);

  // Sync selected platform when modal opens with a specific target platform
  useEffect(() => {
    if (!isOpen) return;
    const target = initialPlatform && guides[initialPlatform] ? initialPlatform : "facebook";
    setSelectedPlatform(target);
    setCheckFeedback(null);
  }, [isOpen, initialPlatform]);

  // Restore saved step for the selected platform (or jump to the step matching activeBlocker)
  useEffect(() => {
    if (!isOpen) return;
    const guide = guides[selectedPlatform];
    if (!guide) return;

    const saved = progressByPlatform[selectedPlatform];
    const blockerReason =
      (activeBlocker && activeBlocker.platform === selectedPlatform
        ? activeBlocker.blockerReason
        : null) || saved?.blockerReason;

    if (blockerReason) {
      const blockerStep = guide.steps.find(
        (s) => Array.isArray(s.blockerCodes) && s.blockerCodes.includes(blockerReason)
      );
      if (blockerStep && (!saved?.currentStep || saved.currentStep === 1)) {
        setActiveStep(blockerStep.number);
        return;
      }
    }

    if (saved?.currentStep && saved.currentStep >= 1 && saved.currentStep <= guide.steps.length) {
      setActiveStep(saved.currentStep);
    } else {
      setActiveStep(1);
    }
  }, [isOpen, selectedPlatform, guides, progressByPlatform, activeBlocker]);

  if (!isOpen) return null;

  const platformGuide = guides[selectedPlatform] || guides.facebook;
  const steps = platformGuide?.steps || [];
  const currentStepData = steps.find((s) => s.number === activeStep) || steps[0];
  const PlatformIcon = PLATFORM_ICONS[selectedPlatform] || FacebookIcon;
  const platformColor = PLATFORM_STYLES[selectedPlatform] || PLATFORM_STYLES.facebook;

  const savedProgress = progressByPlatform[selectedPlatform] || null;
  const effectiveBlocker =
    (activeBlocker && activeBlocker.platform === selectedPlatform
      ? activeBlocker.blockerReason
      : null) || savedProgress?.blockerReason;
  const blockerMessage =
    effectiveBlocker && platformGuide?.blockerMessages?.[effectiveBlocker]
      ? platformGuide.blockerMessages[effectiveBlocker]
      : null;

  const isWaitingOnPlatform = savedProgress?.status === "waiting_on_platform";
  const isConnectedDone = savedProgress?.status === "done" || savedProgress?.isConnected;
  const completedSteps = Array.isArray(savedProgress?.completedSteps) ? savedProgress.completedSteps : [];

  async function persistStepChange(nextStep, extra = {}) {
    setActiveStep(nextStep);
    setCheckFeedback(null);
    if (!canManage) return;

    setSavingStep(true);
    try {
      const res = await api.channelSetup.updateProgress(selectedPlatform, {
        currentStep: nextStep,
        ...extra,
      });
      if (res?.progress && onProgressUpdated) {
        onProgressUpdated(selectedPlatform, res.progress);
      }
    } catch (_err) {
      // keep local step state even if network request fails
    } finally {
      setSavingStep(false);
    }
  }

  async function handleToggleWaitingState() {
    if (!canManage) return;
    const nextStatus = isWaitingOnPlatform ? "in_progress" : "waiting_on_platform";
    setSavingStep(true);
    try {
      const res = await api.channelSetup.updateProgress(selectedPlatform, {
        currentStep: activeStep,
        status: nextStatus,
        blockerReason: nextStatus === "waiting_on_platform" ? "unverified_gbp" : effectiveBlocker,
      });
      if (res?.progress && onProgressUpdated) {
        onProgressUpdated(selectedPlatform, res.progress);
      }
      setCheckFeedback({
        type: "info",
        text:
          nextStatus === "waiting_on_platform"
            ? "Saved as 'Waiting on Google'. Google video verification typically takes 3–5 business days—your place is saved."
            : "Status switched back to 'In progress'.",
      });
    } catch (_err) {
      setCheckFeedback({ type: "error", text: "Could not save waiting status." });
    } finally {
      setSavingStep(false);
    }
  }

  async function handleDoneCheckAgain() {
    if (!canManage) return;
    setCheckingAgain(true);
    setCheckFeedback(null);

    try {
      const nextCompleted = Array.from(new Set([...completedSteps, activeStep]));
      await api.channelSetup.updateProgress(selectedPlatform, {
        currentStep: activeStep,
        completedSteps: nextCompleted,
      });

      const checkRes = await api.channelSetup.checkPlatform(selectedPlatform);
      if (checkRes?.progress && onProgressUpdated) {
        onProgressUpdated(selectedPlatform, checkRes.progress);
      }

      if (checkRes?.connected) {
        setCheckFeedback({
          type: "success",
          text: `${platformGuide.name} is connected and ready to publish!`,
        });
        return;
      }

      if (
        (selectedPlatform === "facebook" || selectedPlatform === "instagram") &&
        onRetryConnect &&
        activeStep === steps.length
      ) {
        onClose();
        onRetryConnect(selectedPlatform);
        return;
      }

      if (checkRes?.waitingOnPlatform) {
        setCheckFeedback({
          type: "info",
          text: "Still waiting on Google verification review (3–5 business days is normal). Your step is saved.",
        });
      } else {
        const msg =
          checkRes?.walkthrough?.message ||
          "Progress saved. Complete the remaining platform step or click 'Connect with Facebook' when ready.";
        setCheckFeedback({
          type: "warning",
          text: msg,
        });
      }
    } catch (_err) {
      setCheckFeedback({
        type: "error",
        text: "Could not re-check platform status right now.",
      });
    } finally {
      setCheckingAgain(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-modal-title"
    >
      <div className="relative w-full max-w-3xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Setup Walkthrough · #08 (F27)
              </span>
              <span className="text-[11px] text-slate-400">
                Steps last checked: <strong className="text-slate-300">{platformGuide.lastChecked}</strong>
              </span>
              {savingStep && (
                <span className="text-[10px] text-indigo-400 animate-pulse">Saving progress...</span>
              )}
            </div>
            <h2 id="walkthrough-modal-title" className="text-base sm:text-lg font-bold text-white mt-1">
              Platform Page & Account Setup Walkthrough
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup walkthrough"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Platform Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 overflow-x-auto px-2 pt-2 gap-1">
          {PLATFORM_ORDER.map((platKey) => {
            const g = guides[platKey];
            if (!g) return null;
            const Icon = PLATFORM_ICONS[platKey] || FacebookIcon;
            const isSelected = platKey === selectedPlatform;
            const platProg = progressByPlatform[platKey];
            const hasBlocker = Boolean(platProg?.blockerReason);
            const isWaiting = platProg?.status === "waiting_on_platform";
            const isDone = platProg?.status === "done" || platProg?.isConnected;

            return (
              <button
                key={platKey}
                type="button"
                onClick={() => {
                  setSelectedPlatform(platKey);
                  setCheckFeedback(null);
                }}
                className={`px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? "border-indigo-500 bg-slate-900 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{g.shortName || g.name}</span>
                {isDone ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                    ✓
                  </span>
                ) : isWaiting ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                    ⏳
                  </span>
                ) : hasBlocker ? (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Stepper Bar */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto">
          {steps.map((step) => {
            const isCurrent = step.number === activeStep;
            const isCompleted = completedSteps.includes(step.number) || step.number < activeStep || isConnectedDone;
            return (
              <button
                key={step.number}
                type="button"
                onClick={() => persistStepChange(step.number)}
                className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center justify-center gap-2 ${
                  isCurrent
                    ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                    : isCompleted
                    ? "border-emerald-500/50 text-slate-300 hover:text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isCurrent
                      ? "bg-indigo-600 text-white"
                      : isCompleted
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {isCompleted && !isCurrent ? "✓" : step.number}
                </span>
                <span className="truncate">{step.title}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Detected Blocker Banner */}
          {blockerMessage && !isConnectedDone && (
            <div
              data-testid="walkthrough-blocker-banner"
              className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                isWaitingOnPlatform
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-200"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>
                  {isWaitingOnPlatform
                    ? "⏳ Waiting on Platform Review (Normal — Not an Error)"
                    : "⚠️ Detected Setup Requirement"}
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-slate-950/60">
                  {effectiveBlocker}
                </span>
              </div>
              <p className="text-slate-200/90 leading-relaxed">{blockerMessage}</p>
            </div>
          )}

          {/* Waiting on Google Reassurance Banner */}
          {isWaitingOnPlatform && !blockerMessage && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
              <div className="font-bold">⏳ Waiting on Google Business Profile Verification</div>
              <p>
                Your progress is saved at Step {activeStep}. Google video review typically takes several business days
                (3–5 days). Come back and click &ldquo;Done — check again&rdquo; once Google confirms verification.
              </p>
            </div>
          )}

          {/* Why This Platform Needs Setup */}
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Why {platformGuide.name} Requires This Setup
            </div>
            <p className="leading-relaxed text-slate-300">{platformGuide.whyNeeded}</p>
            {platformGuide.openDecisionNote && (
              <p className="text-[11px] text-indigo-300/90 pt-1 border-t border-slate-800/80">
                {platformGuide.openDecisionNote}
              </p>
            )}
          </div>

          {/* Step Heading */}
          {currentStepData && (
            <div className="flex items-start gap-3.5 pt-1">
              <span className={`p-3 rounded-lg border ${platformColor} shrink-0`}>
                <PlatformIcon className="w-5 h-5" />
              </span>
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Step {currentStepData.number} of {steps.length}: {currentStepData.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    {currentStepData.badge}
                  </span>
                  {currentStepData.who && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                      Who: {currentStepData.who}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{currentStepData.description}</p>
              </div>
            </div>
          )}

          {/* Action Checklist */}
          {currentStepData && (
            <div className="p-4 rounded-lg bg-slate-950/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Step-by-Step Instructions
                </h4>
                {savedProgress?.lastCheckedAt && (
                  <span className="text-[10px] text-slate-500">
                    Last checked: {new Date(savedProgress.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <ol className="space-y-2.5 text-xs text-slate-200">
                {currentStepData.instructions.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>

              {/* Deep Link for This Step */}
              {currentStepData.linkUrl && (
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">Official platform page for this step:</span>
                  <a
                    href={currentStepData.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    <span>{currentStepData.linkText}</span>
                    <ArrowUpRightIcon className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* GBP Waiting on Google Toggle */}
              {currentStepData.supportsWaitingState && canManage && (
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Submitted your verification video? Google takes 3–5 business days to review.
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleWaitingState}
                    disabled={savingStep}
                    className={`px-3 py-1.5 rounded text-xs font-semibold border transition shrink-0 ${
                      isWaitingOnPlatform
                        ? "bg-amber-500/20 text-amber-200 border-amber-500/40 hover:bg-amber-500/30"
                        : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    {isWaitingOnPlatform ? "✓ Marked Waiting on Google" : "⏳ Mark as Waiting on Google"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Check Feedback Notice */}
          {checkFeedback && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                checkFeedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : checkFeedback.type === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-indigo-500/10 border-indigo-500/30 text-indigo-200"
              }`}
            >
              {checkFeedback.text}
            </div>
          )}

          {/* Delegation Note (Owner vs Editor helper) */}
          {platformGuide.delegation && (
            <div
              data-testid="walkthrough-delegation-note"
              className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                viewerRole === "editor"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-100"
                  : "bg-slate-950/50 border-slate-800 text-slate-300"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>
                  👥 Role & Delegation Note{" "}
                  {viewerRole === "editor" ? "(You are signed in as an Editor)" : "(Owner & Editor Helpers)"}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">{platformGuide.delegation.summary}</p>
              <p className="text-slate-400 leading-relaxed">{platformGuide.delegation.howToDelegate}</p>
              {platformGuide.delegation.delegateLinkUrl && (
                <div className="pt-1">
                  <a
                    href={platformGuide.delegation.delegateLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]"
                  >
                    <span>{platformGuide.delegation.delegateLinkText || "Learn how to assign roles"}</span>
                    <ArrowUpRightIcon className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Official References */}
          {Array.isArray(platformGuide.references) && platformGuide.references.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
              <span>Verified references ({platformGuide.lastChecked}):</span>
              {platformGuide.references.map((ref, i) => (
                <a
                  key={i}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-indigo-400 underline underline-offset-2"
                >
                  <span>{ref.label}</span>
                  <ArrowUpRightIcon className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => persistStepChange(activeStep - 1)}
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold transition"
              >
                ← Previous Step
              </button>
            )}
            {activeStep < steps.length && (
              <button
                type="button"
                onClick={() =>
                  persistStepChange(activeStep + 1, {
                    completedSteps: Array.from(new Set([...completedSteps, activeStep])),
                  })
                }
                className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-white font-semibold transition"
              >
                Next Step →
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {canManage && onUseSandbox && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUseSandbox(selectedPlatform);
                }}
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold border border-slate-700 transition"
              >
                Use Sandbox Mode
              </button>
            )}
            {canManage && (
              <button
                type="button"
                disabled={checkingAgain}
                onClick={handleDoneCheckAgain}
                className="px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>{checkingAgain ? "Checking..." : "Done — check again"}</span>
              </button>
            )}
            {canManage &&
              onRetryConnect &&
              (selectedPlatform === "facebook" || selectedPlatform === "instagram") && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRetryConnect(selectedPlatform);
                  }}
                  className="px-4 py-2 rounded-md gradient-brand text-xs text-white font-semibold hover:opacity-95 transition flex items-center gap-1.5"
                >
                  <span>Connect with Facebook</span>
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
