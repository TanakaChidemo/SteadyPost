"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "../lib/store";
import { api, setActiveWorkspaceId } from "../lib/apiClient";
import { ROLE_INFO, TEAM_ROLES, can } from "../lib/roles";
import { inputClass } from "./ProfileFields";
import { SignInPrompt } from "./SignInPrompt";

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

/** The people on the current business, and (for the owner) invite links. */
export function TeamManager() {
  const { authReady, user, currentWorkspace, fetchWorkspaces, addToast } = useAppStore();
  const [team, setTeam] = useState(null);
  const workspaceId = currentWorkspace?.id || currentWorkspace?._id;
  const manages = can(currentWorkspace, "members.manage");

  const load = useCallback(() => {
    if (!workspaceId) return;
    api.workspaces
      .team()
      .then(setTeam)
      .catch((err) => addToast("error", errorText(err, "Couldn't load the team")));
  }, [workspaceId, addToast]);

  useEffect(() => {
    setTeam(null);
    if (authReady && user) load();
  }, [authReady, user, load]);

  if (!authReady) return <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading team...</div>;
  if (!user) {
    return <SignInPrompt title="Sign in to see your team">Your team belongs to a business on SteadyPost.</SignInPrompt>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Team</h1>
        <p className="text-xs text-slate-400 mt-0.5">{currentWorkspace?.name}</p>
      </div>

      {!team ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">Loading team...</div>
      ) : (
        <>
          <ul className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/60">
            {team.members.map((member) => (
              <MemberRow key={member.id} member={member} manages={manages} onChanged={load} />
            ))}
          </ul>

          {manages && <InviteBox invitations={team.invitations} onChanged={load} />}

          {currentWorkspace?.role !== "owner" && (
            <LeaveTeam
              workspaceName={currentWorkspace?.name}
              onLeft={async (next) => {
                setActiveWorkspaceId(next);
                await fetchWorkspaces();
                addToast("success", `You left ${currentWorkspace?.name}`);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function MemberRow({ member, manages, onChanged }) {
  const addToast = useAppStore((s) => s.addToast);
  const [confirming, setConfirming] = useState(false);
  const editable = manages && member.role !== "owner";

  async function changeRole(role) {
    try {
      await api.workspaces.changeRole(member.id, role);
      onChanged();
    } catch (err) {
      addToast("error", errorText(err, "Couldn't change their role"));
    }
  }

  async function remove() {
    try {
      await api.workspaces.removeMember(member.id);
      addToast("success", `Removed ${member.name || member.email}`);
      onChanged();
    } catch (err) {
      addToast("error", errorText(err, "Couldn't remove them"));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="flex-1 min-w-[10rem]">
        <div className="text-sm text-slate-100">
          {member.name || member.email}
          {member.isYou && <span className="text-slate-500"> (you)</span>}
        </div>
        {member.name && <div className="text-[11px] text-slate-500">{member.email}</div>}
      </div>

      {editable ? (
        <>
          <select
            value={member.role}
            onChange={(e) => changeRole(e.target.value)}
            aria-label={`Role for ${member.name || member.email}`}
            className="px-2 py-1.5 rounded-md bg-slate-950 border border-slate-800 text-xs text-slate-200"
          >
            {TEAM_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_INFO[role].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => (confirming ? remove() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
            className={`text-xs px-2 py-1.5 rounded-md transition ${
              confirming ? "bg-red-600 text-white" : "text-slate-400 hover:text-red-300"
            }`}
          >
            {confirming ? "Remove?" : "Remove"}
          </button>
        </>
      ) : (
        <span className="text-xs text-slate-400">{ROLE_INFO[member.role]?.label}</span>
      )}
    </li>
  );
}

function InviteBox({ invitations, onChanged }) {
  const addToast = useAppStore((s) => s.addToast);
  const [role, setRole] = useState("editor");
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const [creating, setCreating] = useState(false);

  async function create(e) {
    e.preventDefault();
    try {
      setCreating(true);
      const { inviteLink } = await api.workspaces.createInvite(role, label.trim() || undefined);
      setLink(`${window.location.origin}${inviteLink}`);
      setLabel("");
      onChanged();
    } catch (err) {
      addToast("error", errorText(err, "Couldn't create the link"));
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      addToast("success", "Link copied");
    } catch {
      addToast("info", "Select the link and copy it");
    }
  }

  async function cancel(id) {
    try {
      await api.workspaces.cancelInvite(id);
      onChanged();
    } catch (err) {
      addToast("error", errorText(err, "Couldn't cancel the link"));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-white">Invite someone</h2>
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Their role"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
        >
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}: {ROLE_INFO[r].blurb.toLowerCase()}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="Who's it for? (optional)"
          aria-label="Who's it for"
          className={`${inputClass} flex-1 min-w-[10rem] w-auto`}
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg gradient-brand text-xs font-semibold text-white disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create link"}
        </button>
      </form>

      {link && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputClass} flex-1`} aria-label="Invite link" />
            <button type="button" onClick={copy} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800">
              Copy
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Send it however you like. It works once, for 7 days, and you won&apos;t see it again after leaving this page.
          </p>
        </div>
      )}

      {invitations.length > 0 && (
        <ul className="space-y-1">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex-1">
                Waiting: {inv.label || "invite link"} · {ROLE_INFO[inv.role]?.label} · until{" "}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
              <button type="button" onClick={() => cancel(inv.id)} className="hover:text-red-300">
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LeaveTeam({ workspaceName, onLeft }) {
  const router = useRouter();
  const addToast = useAppStore((s) => s.addToast);
  const [confirming, setConfirming] = useState(false);

  async function leave() {
    try {
      const { activeWorkspaceId } = await api.workspaces.leave();
      await onLeft(activeWorkspaceId);
      router.push("/dashboard");
    } catch (err) {
      addToast("error", errorText(err, "Couldn't leave the team"));
    }
  }

  return (
    <div className="pt-4 border-t border-slate-800">
      <button
        type="button"
        onClick={() => (confirming ? leave() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className={`text-xs px-3 py-2 rounded-lg transition ${
          confirming ? "bg-red-600 text-white" : "border border-slate-800 text-slate-400 hover:text-red-300"
        }`}
      >
        {confirming ? `Leave ${workspaceName}?` : "Leave this team"}
      </button>
    </div>
  );
}
