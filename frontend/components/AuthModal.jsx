"use client";

import React, { useState } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { SparklesIcon } from "./Icons";
import { Modal, ModalHeader } from "./ui/Modal";
import { Field, Input } from "./ui/Field";
import { Button } from "./ui/Button";
import { Tabs } from "./ui/Tabs";
import { cn } from "../lib/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

export function AuthModal() {
  const { isAuthModalOpen, setAuthModalOpen, setUser, addToast } = useAppStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const res = await api.auth.register({ email, password, name });
        setUser(res.user, res.accessToken, res.refreshToken);
        addToast("success", `Welcome aboard, ${res.user.name}!`);
      } else {
        const res = await api.auth.login({ email, password });
        setUser(res.user, res.accessToken, res.refreshToken);
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
    <Modal
      open={isAuthModalOpen}
      onClose={() => setAuthModalOpen(false)}
      labelledBy="auth-modal-title"
      size="md"
    >
      <ModalHeader
        id="auth-modal-title"
        title={isRegister ? "Create your account" : "Sign in to SteadyPost"}
        subtitle="AI copywriting & instant publishing to Instagram and Facebook"
        onClose={() => setAuthModalOpen(false)}
      />

      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-[14px] bg-brand-500 border border-brand-600 flex items-center justify-center shadow-1">
          <SparklesIcon className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
        <p className="font-mono text-label uppercase text-ink-3 mt-3">Identity gateway</p>
      </div>

      <Tabs
        label="Authentication mode"
        tabs={[
          { id: "signin", label: "Sign In" },
          { id: "signup", label: "Sign Up" },
        ]}
        activeId={isRegister ? "signup" : "signin"}
        onChange={(id) => setIsRegister(id === "signup")}
        className="w-full grid grid-cols-2 mb-5"
      />

      <Button
        variant="secondary"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full mb-3"
      >
        <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
          <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.9 39.7 16.4 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.3 36.1 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
        </svg>
        Continue with Google
      </Button>

      <div className="flex items-center my-4 text-ink-3 text-caption" aria-hidden="true">
        <div className="flex-1 border-t border-line" />
        <span className="px-3">or continue with email</span>
        <div className="flex-1 border-t border-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister && (
          <Field label="Full Name">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tanaka Chidemo"
              autoComplete="name"
            />
          </Field>
        )}
        <Field label="Email Address">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </Field>
        <div className="p-3 rounded-lg bg-card-muted border border-line text-caption flex items-center justify-between">
          <div>
            <span className="font-mono text-micro uppercase tracking-wider text-ink-3 block">Demo Account</span>
            <span className="text-ink font-medium">demo@example.com</span>
            <span className="text-ink-3"> / </span>
            <span className="font-mono text-ink-2">password123</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail("demo@example.com");
              setPassword("password123");
            }}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md border border-brand-500/20 transition"
          >
            Auto-fill
          </button>
        </div>

        <Button type="submit" disabled={loading} loading={loading} className={cn("w-full")}>
          {loading ? "Please wait…" : isRegister ? "Create Account" : "Sign In"}
        </Button>
      </form>
    </Modal>
  );
}
