"use client";

import React from "react";
import Link from "next/link";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  LayersIcon,
} from "../components/Icons";
import { useAppStore } from "../lib/store";

export default function HomePage() {
  const { setAuthModalOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="h-20 max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md gradient-brand flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">SteadyPost</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAuthModalOpen(true)}
            className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 transition"
          >
            Sign In
          </button>
          <Link
            href="/dashboard"
            className="text-xs font-semibold px-4 py-2 rounded-md gradient-brand text-white hover:opacity-95 transition"
          >
            Launch Studio →
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-16 text-center space-y-8 my-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
          <SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Gen Omnichannel Publishing & AI Content Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight max-w-4xl mx-auto">
          One Platform to <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Draft, Generate & Publish</span> Across Your Networks
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Create platform-perfect content for Instagram and Facebook.
          Generate viral copy with AI, and publish instantly to your connected accounts.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg gradient-brand text-white font-bold text-sm hover:opacity-95 transition"
          >
            Open Publishing Dashboard
          </Link>
          <Link
            href="/dashboard/content"
            className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold text-sm transition"
          >
            Try AI Content Studio
          </Link>
        </div>

        {/* Supported Platforms Pill */}
        <div className="flex items-center justify-center gap-6 pt-6 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1.5 text-pink-400">
            <InstagramIcon className="w-4 h-4" /> Instagram
          </span>
          <span className="flex items-center gap-1.5 text-blue-500">
            <FacebookIcon className="w-4 h-4" /> Facebook
          </span>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-12">
          <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <LayersIcon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Native Previews</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Compose once with live previews tailored to each network’s character limits and media formats.
            </p>
          </div>

          <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5">
            <div className="w-9 h-9 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">AI Studio & Repurposer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate platform-optimized captions, trending hashtags, and adapt a single post across channels in seconds.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-16 max-w-7xl mx-auto w-full px-6 flex items-center justify-between border-t border-slate-900 text-xs text-slate-500">
        <div>© 2026 SteadyPost Platform. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="hover:text-slate-300">Dashboard</Link>
          <Link href="/dashboard/content" className="hover:text-slate-300">Studio</Link>
        </div>
      </footer>
    </div>
  );
}
