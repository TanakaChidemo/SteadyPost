"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "../../../lib/store";
import { api, setActiveWorkspaceId } from "../../../lib/apiClient";
import { ROLE_INFO } from "../../../lib/roles";
import { SparklesIcon } from "../../../components/Icons";

/** Where an invite link lands: shows whose team it is, then joins it. */
export default function AcceptInvitationPage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4 text-center">
        <div className="w-10 h-10 mx-auto rounded-lg gradient-brand flex items-center justify-center">
          <SparklesIcon className="w-5 h-5 text-white" />
        </div>
        <Suspense fallback={<Loading />}>
          <Invitation />
        </Suspense>
      </div>
    </main>
  );
}

const Loading = () => <p className="text-xs text-slate-500 animate-pulse">Checking your invite...</p>;

function Invitation() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const { authReady, user, setAuthModalOpen, fetchWorkspaces, addToast } = useAppStore();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!authReady || !user || !token) return;
    api.workspaces
      .previewInvite(token)
      .then(setInvite)
      .catch((err) => setError(err?.response?.data?.error || "We couldn't check this invite."));
  }, [authReady, user, token]);

  async function openBusiness(workspaceId, message) {
    setActiveWorkspaceId(workspaceId);
    await fetchWorkspaces();
    if (message) addToast("success", message);
    router.push("/dashboard");
  }

  async function join() {
    try {
      setJoining(true);
      const { workspaceId } = await api.workspaces.acceptInvite(token);
      await openBusiness(workspaceId, `You've joined ${invite.workspaceName}`);
    } catch (err) {
      setError(err?.response?.data?.error || "We couldn't add you to this team.");
      setJoining(false);
    }
  }

  if (!token) return <Problem text="This invite link is incomplete. Ask for a new one." />;
  if (!authReady) return <Loading />;

  if (!user) {
    return (
      <>
        <h1 className="text-lg font-bold text-white">You&apos;ve been invited to a team</h1>
        <p className="text-xs text-slate-400">Sign in, or create a free account, to see the invite and join.</p>
        <button
          onClick={() => setAuthModalOpen(true)}
          className="w-full px-4 py-2.5 rounded-lg gradient-brand text-sm font-semibold text-white"
        >
          Sign in to continue
        </button>
      </>
    );
  }

  if (error) return <Problem text={error} />;
  if (!invite) return <Loading />;

  const role = ROLE_INFO[invite.role];
  const owner = invite.ownerName || "The owner";

  if (invite.alreadyMember) {
    return (
      <>
        <h1 className="text-lg font-bold text-white">You&apos;re already on this team</h1>
        <p className="text-xs text-slate-400">{invite.workspaceName}</p>
        <Link href="/dashboard" className="block w-full px-4 py-2.5 rounded-lg gradient-brand text-sm font-semibold text-white">
          Go to your dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-bold text-white">Join {invite.workspaceName}</h1>
      <p className="text-sm text-slate-300">
        {owner} invited you as {role.label === "Editor" ? "an" : "a"} <span className="font-semibold">{role.label}</span>.
      </p>
      <p className="text-xs text-slate-400">
        {role.label}s {role.blurb.charAt(0).toLowerCase() + role.blurb.slice(1)}. Your own businesses stay yours.
      </p>
      <button
        onClick={join}
        disabled={joining}
        className="w-full px-4 py-2.5 rounded-lg gradient-brand text-sm font-semibold text-white disabled:opacity-50"
      >
        {joining ? "Joining..." : "Join team"}
      </button>
      <Link href="/dashboard" className="block text-xs text-slate-500 hover:text-slate-300">
        Not now
      </Link>
    </>
  );
}

function Problem({ text }) {
  return (
    <>
      <h1 className="text-lg font-bold text-white">This invite can&apos;t be used</h1>
      <p className="text-xs text-slate-400">{text}</p>
      <Link href="/dashboard" className="block text-xs text-indigo-400 hover:text-indigo-300">
        Go to your dashboard
      </Link>
    </>
  );
}
