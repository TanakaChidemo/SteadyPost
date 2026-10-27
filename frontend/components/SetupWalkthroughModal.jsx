"use client";

import React, { useState } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  CheckIcon,
  ArrowUpRightIcon,
  LayersIcon,
} from "./Icons";

export function SetupWalkthroughModal({ isOpen, onClose, onRetryConnect, onUseSandbox }) {
  const [activeStep, setActiveStep] = useState(1);

  if (!isOpen) return null;

  const steps = [
    {
      number: 1,
      title: "Create a Facebook Page",
      badge: "Requirement",
      icon: FacebookIcon,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
      description: "Meta requires a Business Page rather than a personal profile for third-party publishing tools.",
      instructions: [
        "Go to Facebook and select 'Pages' from the left menu (or click Create Page below).",
        "Name your Page to match your business, venture, or project.",
        "Add a primary category (e.g., Local Business, Brand, Retail) and bio.",
        "Ensure the Page is published and not restricted to private view.",
      ],
      linkText: "Open Facebook Page Creation",
      linkUrl: "https://www.facebook.com/pages/create",
    },
    {
      number: 2,
      title: "Switch Instagram to Professional",
      badge: "Required for IG",
      icon: InstagramIcon,
      color: "text-pink-400 bg-pink-500/10 border-pink-500/30",
      description: "Personal Instagram accounts cannot be accessed via the Meta Graph API. A Professional (Business or Creator) account is required.",
      instructions: [
        "Open Instagram app or web settings > 'Account'.",
        "Scroll down and tap 'Switch to professional account'.",
        "Choose 'Business' or 'Creator' (both support automated scheduling and metrics).",
        "Fill in your public business contact details.",
      ],
      linkText: "Meta Guide: Setting Up Instagram Professional",
      linkUrl: "https://help.instagram.com/502981923235522",
    },
    {
      number: 3,
      title: "Link Instagram to Facebook Page",
      badge: "Crucial Step",
      icon: LayersIcon,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      description: "Connect your Instagram account inside Meta Business Suite so a single login grants publishing rights to both channels.",
      instructions: [
        "Navigate to Meta Business Suite at business.facebook.com.",
        "Select your Page, then go to 'Settings' > 'Connected accounts'.",
        "Click 'Connect Instagram' and log in with your Instagram credentials.",
        "Toggle 'Allow access to Instagram messages and posts in Inbox'.",
      ],
      linkText: "Open Meta Business Suite Connected Accounts",
      linkUrl: "https://business.facebook.com/latest/settings/connected_accounts",
    },
    {
      number: 4,
      title: "Verify Role & Reconnect",
      badge: "Ready",
      icon: CheckIcon,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      description: "Ensure your user account has Task Access or Full Control in Meta Business Suite, then re-authorize SteadyPost.",
      instructions: [
        "Under Meta Business Suite > Users > People, check that your account has 'Create content' and 'View insights' permissions.",
        "Return to SteadyPost and click 'Try Reconnecting Now'.",
        "Select your Page in the picker when prompted.",
      ],
      linkText: "Meta Business Suite Users",
      linkUrl: "https://business.facebook.com/latest/settings/people",
    },
  ];

  const currentStepData = steps.find((s) => s.number === activeStep) || steps[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Setup Walkthrough · #08 (F27)
              </span>
              <span className="text-xs text-slate-400">Meta & Google Channels</span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">Connect Your Business Channels</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Stepper Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto">
          {steps.map((step) => {
            const isCurrent = step.number === activeStep;
            const isPassed = step.number < activeStep;
            return (
              <button
                key={step.number}
                onClick={() => setActiveStep(step.number)}
                className={`flex-1 min-w-[120px] py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center justify-center gap-2 ${
                  isCurrent
                    ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                    : isPassed
                    ? "border-emerald-500/50 text-slate-300 hover:text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isCurrent
                      ? "bg-indigo-600 text-white"
                      : isPassed
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {isPassed ? "✓" : step.number}
                </span>
                <span className="truncate">{step.title}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="flex items-start gap-4">
            <span className={`p-3 rounded-lg border ${currentStepData.color} shrink-0`}>
              <currentStepData.icon className="w-6 h-6" />
            </span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Step {currentStepData.number}: {currentStepData.title}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {currentStepData.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400">{currentStepData.description}</p>
            </div>
          </div>

          {/* Action Checklist */}
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              Step Checklist:
            </h4>
            <ul className="space-y-2 text-xs text-slate-300">
              {currentStepData.instructions.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* External Resource Link */}
          {currentStepData.linkUrl && (
            <div className="flex items-center justify-between p-3 rounded-md bg-indigo-950/20 border border-indigo-500/20 text-xs">
              <span className="text-slate-300">Official resource for this step:</span>
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

          {/* Troubleshooting tip */}
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90">
            <strong>Tip:</strong> If you don&apos;t manage a live Facebook Page or Instagram Business account right now, you can link a demo account in <strong>Sandbox Mode</strong> to test multi-channel publishing and metrics immediately.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => setActiveStep((prev) => prev - 1)}
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold transition"
              >
                ← Previous Step
              </button>
            )}
            {activeStep < steps.length ? (
              <button
                type="button"
                onClick={() => setActiveStep((prev) => prev + 1)}
                className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition"
              >
                Next Step →
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {onUseSandbox && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onUseSandbox();
                }}
                className="px-3.5 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold border border-slate-700 transition"
              >
                Use Sandbox Mode
              </button>
            )}
            {onRetryConnect && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRetryConnect();
                }}
                className="px-4 py-2 rounded-md gradient-brand text-xs text-white font-semibold hover:opacity-95 transition flex items-center gap-1.5"
              >
                <CheckIcon className="w-4 h-4" />
                <span>Try Reconnecting Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

