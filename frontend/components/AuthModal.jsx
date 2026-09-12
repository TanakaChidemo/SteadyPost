"use client";

import React, { useState } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { SparklesIcon, CheckIcon } from "./Icons";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

export function AuthModal() {
  const { isAuthModalOpen, setAuthModalOpen, setUser, addToast } = useAppStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.auth.register({ email, password, name });
        setUser(res.user, res.accessToken);
        addToast("success", `Welcome aboard, ${res.user.name}!`);
      } else {
        const res = await api.auth.login({ email, password });
        setUser(res.user, res.accessToken);
        addToast("success", `Welcome back, ${res.user.name}!`);
      }
      setAuthModalOpen(false);
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${API_BASE_URL}/auth/oauth/google`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="relative w-full max-w-md p-6 rounded-lg bg-slate-900 border border-slate-800">
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-lg gradient-brand flex items-center justify-center mb-3">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegister ? "Create your Account" : "Sign In to SocialSphere"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            AI Copywriting & Instant Publishing to Instagram & Facebook
          </p>
        </div>

        <div className="flex mb-5 rounded-md bg-slate-950 border border-slate-800 p-1">
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            className={`flex-1 py-2 rounded text-xs font-semibold transition ${
              !isRegister ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            className={`flex-1 py-2 rounded text-xs font-semibold transition ${
              isRegister ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sign Up
          </button>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full mb-3 py-2.5 px-4 rounded-md bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.9 39.7 16.4 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.3 36.1 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center my-3 text-slate-600 text-xs">
          <div className="flex-1 border-t border-slate-800" />
          <span className="px-3">or continue with email</span>
          <div className="flex-1 border-t border-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tanaka Chidemo"
                className="w-full px-3.5 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3.5 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
          >
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
