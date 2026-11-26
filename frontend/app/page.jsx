"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  TwitterIcon,
  LinkedInIcon,
  GoogleIcon,
} from "../components/Icons";
import { UserMenu } from "../components/UserMenu";
import { FeatureCarousel } from "../components/FeatureCarousel";
import { useAppStore } from "../lib/store";

// Every channel SteadyPost can publish to (see Social Accounts).
const PLATFORMS = [
  { name: "Instagram", icon: InstagramIcon, color: "text-pink-400" },
  { name: "Facebook", icon: FacebookIcon, color: "text-blue-500" },
  { name: "X", icon: TwitterIcon, color: "text-slate-200" },
  { name: "LinkedIn", icon: LinkedInIcon, color: "text-sky-500" },
  { name: "Google Business", icon: GoogleIcon, color: "text-emerald-400" },
];

export default function HomePage() {
  const { user, authReady, isAuthModalOpen, setAuthModalOpen } = useAppStore();
  const router = useRouter();
  // Where to go once signed in, when a link that needs an account was clicked signed out.
  const [afterSignIn, setAfterSignIn] = useState(null);

  useEffect(() => {
    if (user && afterSignIn) router.push(afterSignIn);
  }, [user, afterSignIn, router]);

  useEffect(() => {
    // Closing the sign-in box without signing in drops the pending link.
    if (!isAuthModalOpen && !user) setAfterSignIn(null);
  }, [isAuthModalOpen, user]);

  function requireSignIn(e) {
    if (user) return;
    e.preventDefault();
    setAfterSignIn(e.currentTarget.getAttribute("href"));
    setAuthModalOpen(true);
  }

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
          {/* Nothing until the saved login is checked, so "Sign In" doesn't flash for signed-in users. */}
          {authReady &&
            (user ? (
              <UserMenu />
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 transition"
              >
                Sign In
              </button>
            ))}
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-6xl mx-auto px-6 py-16 text-center space-y-8 my-auto">
        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight max-w-4xl mx-auto">
          One Platform to <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Draft, Generate & Publish</span> Across Your Networks
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Create platform-perfect content for every channel you run.
          Generate on-brand copy with AI, and publish instantly to your connected accounts.
        </p>

        {/* CTA: signed out, it asks you to sign in and then opens the dashboard */}
        <div className="flex items-center justify-center pt-2">
          <Link
            href="/dashboard"
            onClick={requireSignIn}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg gradient-brand text-white font-bold text-sm hover:opacity-95 transition"
          >
            Open Publishing Dashboard
          </Link>
        </div>

        {/* Supported Platforms */}
        <ul aria-label="Supported platforms" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-6 text-xs font-medium">
          {PLATFORMS.map(({ name, icon: Icon, color }) => (
            <li key={name} className={`flex items-center gap-1.5 ${color}`}>
              <Icon className="w-4 h-4" /> {name}
            </li>
          ))}
        </ul>

        <FeatureCarousel />
      </main>

      {/* Footer */}
      <footer className="h-16 max-w-7xl mx-auto w-full px-6 flex items-center justify-center border-t border-slate-900 text-xs text-slate-500">
        <div>© 2026 SteadyPost Platform. All rights reserved.</div>
      </footer>
    </div>
  );
}
