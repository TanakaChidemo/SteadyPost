"use client";

import React from "react";
import Link from "next/link";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  LayersIcon,
  SendIcon,
  CheckIcon,
} from "../components/Icons";
import { useAppStore } from "../lib/store";

/*
 * SteadyPost landing — warm-paper editorial enterprise language:
 * serif display headline with italic forest accent, mono eyebrow labels,
 * comfortable spacing, restrained 200ms micro-interactions.
 */
const CAPABILITIES = [
  {
    icon: LayersIcon,
    title: "Native feed previews",
    body: "Compose once and see exactly how the post renders on each network — character limits, media formats and all.",
    tone: "bg-brand-50 text-brand-600 border-brand-500/25",
  },
  {
    icon: SparklesIcon,
    title: "AI studio & repurposer",
    body: "Generate platform-optimized captions and trending hashtags, then adapt a single post across channels in seconds.",
    tone: "bg-ai-100 text-ai-500 border-ai-500/25",
  },
  {
    icon: SendIcon,
    title: "Publish in sync",
    body: "Send to every connected account at once, with per-channel delivery status — no tab-switching, no copy-paste.",
    tone: "bg-info-bg text-info border-info/25",
  },
];

export default function HomePage() {
  const { setAuthModalOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Sticky nav — template: 70px, backdrop blur, bottom border */}
      <header className="sticky top-0 z-40 h-[70px] border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="max-w-[1200px] mx-auto h-full px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="SteadyPost home">
            <span className="w-9 h-9 rounded-[10px] bg-brand-500 border border-brand-600 flex items-center justify-center shadow-1">
              <SparklesIcon className="w-5 h-5 text-white" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-bold text-body text-ink tracking-tight">SteadyPost</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-3">
                Content studio
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuthModalOpen(true)}
              className="text-body-sm font-semibold text-ink-2 hover:text-ink px-3 py-2 transition"
            >
              Sign in
            </button>
            <Link href="/dashboard">
              <span className="btn-brand inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-body-sm font-semibold transition-all duration-200">
                Launch Studio →
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-[1040px] mx-auto px-6 pt-20 pb-16 text-center">
          <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-line shadow-1 font-mono text-label uppercase text-ink-2">
            <SparklesIcon className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
            Omnichannel publishing & AI content engine
          </p>

          <h1 className="font-serif text-display text-ink mt-8 max-w-4xl mx-auto">
            Draft, generate & publish —
            <br />
            <em className="text-brand-600">orchestrated with elegance.</em>
          </h1>

          <p className="text-body text-ink-2 max-w-2xl mx-auto mt-6 leading-relaxed">
            One calm workspace for Instagram and Facebook. Create platform-perfect
            content, generate on-brand copy with AI, and publish to every connected
            account in a single motion.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <Link href="/dashboard">
              <span className="btn-brand inline-flex items-center justify-center w-full sm:w-auto px-8 py-3 rounded-[10px] font-semibold text-body transition-all duration-200">
                Open Publishing Dashboard
              </span>
            </Link>
            <Link href="/dashboard/content">
              <span className="inline-flex items-center justify-center w-full sm:w-auto px-7 py-3 rounded-[10px] bg-card border border-line shadow-1 text-ink font-semibold text-body hover:bg-card-muted hover:-translate-y-px transition-all duration-200">
                Try AI Content Studio
              </span>
            </Link>
          </div>

          {/* Trust bar */}
          <div className="flex items-center justify-center gap-8 mt-12 text-caption font-medium text-ink-2">
            <span className="flex items-center gap-2">
              <InstagramIcon className="w-4 h-4 text-social-instagram" aria-hidden="true" />
              Instagram
            </span>
            <span className="w-px h-4 bg-line" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <FacebookIcon className="w-4 h-4 text-social-facebook" aria-hidden="true" />
              Facebook
            </span>
            <span className="w-px h-4 bg-line" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <CheckIcon className="w-4 h-4 text-success" aria-hidden="true" />
              Live previews
            </span>
          </div>
        </section>

        {/* Capabilities */}
        <section className="max-w-[1200px] mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger">
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <article
                  key={c.title}
                  className="p-6 rounded-lg bg-card border border-line shadow-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span
                    className={`w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center ${c.tone}`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <h2 className="font-serif text-h2 text-ink mt-5">{c.title}</h2>
                  <p className="text-body-sm text-ink-2 mt-2 leading-relaxed">{c.body}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between text-caption text-ink-3">
          <span>© 2026 SteadyPost. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-ink-2 transition">Dashboard</Link>
            <Link href="/dashboard/content" className="hover:text-ink-2 transition">Studio</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
