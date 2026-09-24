"use client";

import React, { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "../../../lib/store";
import { api, setTokens, clearTokens } from "../../../lib/apiClient";
import { SparklesIcon } from "../../../components/Icons";

function CallbackFallback() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-lg gradient-brand flex items-center justify-center animate-pulse">
          <SparklesIcon className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm text-slate-400">Finishing sign-in…</p>
      </div>
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, addToast } = useAppStore();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const error = searchParams.get("error");
    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");

    if (error || !accessToken) {
      addToast("error", error ? `Google sign-in failed: ${error}` : "Google sign-in failed");
      router.replace("/");
      return;
    }

    setTokens({ accessToken, refreshToken });
    api.auth
      .me()
      .then((res) => {
        setUser(res.user, accessToken, refreshToken);
        addToast("success", `Welcome, ${res.user.name}!`);
        router.replace("/dashboard");
      })
      .catch(() => {
        clearTokens();
        addToast("error", "Google sign-in failed");
        router.replace("/");
      });
  }, [searchParams, router, setUser, addToast]);

  return <CallbackFallback />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
