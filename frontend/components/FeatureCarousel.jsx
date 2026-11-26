"use client";

import React, { useEffect, useState } from "react";
import { stepIndex, wrapIndex } from "../lib/carousel";
import { LayersIcon, SparklesIcon, CalendarIcon, TeamIcon, CheckIcon, GoogleIcon } from "./Icons";

const AUTO_ADVANCE_MS = 6000;

// Features that exist in the app today; keep this list in step with what ships.
const FEATURES = [
  {
    icon: LayersIcon,
    tone: "indigo",
    title: "Native Previews",
    text: "Compose once and see live previews shaped to each network’s character limits and media formats.",
  },
  {
    icon: SparklesIcon,
    tone: "purple",
    title: "AI Studio & Repurposer",
    text: "Generate captions and hashtags, compare drafts from several AI models, and adapt one post for every channel.",
  },
  {
    icon: CheckIcon,
    tone: "emerald",
    title: "Brand-Voice Guardrails",
    text: "Every draft is checked against your business profile’s tone and rules before it can go out.",
  },
  {
    icon: TeamIcon,
    tone: "sky",
    title: "Team Roles & Approvals",
    text: "Invite editors and viewers. Editors write, owners approve, and nothing publishes without sign-off.",
  },
  {
    icon: CalendarIcon,
    tone: "amber",
    title: "Scheduling",
    text: "Queue posts for the right moment and publish to several connected accounts at once.",
  },
  {
    icon: GoogleIcon,
    tone: "rose",
    title: "Google Business Posts",
    text: "Publish local posts with offers and call-to-action buttons straight to your Google Business Profile.",
  },
];

const TONES = {
  indigo: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
  purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  sky: "bg-sky-500/10 border-sky-500/20 text-sky-400",
  amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  rose: "bg-rose-500/10 border-rose-500/20 text-rose-400",
};

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function FeatureCarousel() {
  const count = FEATURES.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;
    const id = setInterval(() => setIndex((i) => stepIndex(i, 1, count)), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  const go = (step) => setIndex((i) => stepIndex(i, step, count));

  return (
    <section
      aria-roledescription="carousel"
      aria-label="SteadyPost features"
      className="w-full pt-12 text-left max-w-3xl mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
    >
      <div className="relative overflow-hidden rounded-lg">
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}: ${f.title}`}
                aria-hidden={i !== index}
                className="w-full shrink-0 px-0.5"
              >
                <div className="p-6 sm:p-8 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-h-[9rem]">
                  <div className={`w-12 h-12 shrink-0 rounded-md border flex items-center justify-center ${TONES[f.tone]}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-bold text-white">{f.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{f.text}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 pt-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous feature"
          className="w-8 h-8 rounded-full border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 flex items-center justify-center transition"
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              type="button"
              onClick={() => setIndex(wrapIndex(i, count))}
              aria-label={`Show ${f.title}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-indigo-400" : "w-2 bg-slate-700 hover:bg-slate-500"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next feature"
          className="w-8 h-8 rounded-full border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 flex items-center justify-center transition"
        >
          ›
        </button>
      </div>
    </section>
  );
}
