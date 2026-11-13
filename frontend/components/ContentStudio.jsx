"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "../lib/store";
import { SignInPrompt } from "./SignInPrompt";
import { api } from "../lib/apiClient";
import {
  InstagramIcon,
  FacebookIcon,
  TwitterIcon,
  LinkedInIcon,
  GoogleIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  SendIcon,
  CheckIcon,
  ClockIcon,
  RefreshIcon,
  BarChartIcon,
  LayersIcon,
  SpinnerIcon,
} from "./Icons";
import { AIModal } from "./AIModal";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: InstagramIcon, maxChars: 2200, color: "text-pink-400 border-pink-500/40 bg-pink-500/10" },
  { id: "facebook", label: "Facebook", icon: FacebookIcon, maxChars: 63206, color: "text-blue-500 border-blue-600/40 bg-blue-600/10" },
  { id: "twitter", label: "Twitter / X", icon: TwitterIcon, maxChars: 280, color: "text-sky-400 border-sky-500/40 bg-sky-500/10" },
  { id: "linkedin", label: "LinkedIn", icon: LinkedInIcon, maxChars: 3000, color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { id: "gbp", label: "GBP", icon: GoogleIcon, maxChars: 1500, color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
];

const GBP_CTA_LABELS = {
  LEARN_MORE: "Learn More",
  ORDER: "Order Online",
  BOOK: "Book",
  SIGN_UP: "Sign Up",
  CALL: "Call Now",
};

const PIPELINE_STATUS_STYLES = {
  draft: "bg-slate-800 text-slate-300 border-slate-700",
  pending_approval: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  approved: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  changes_requested: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  scheduled: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  publishing: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  published: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

function normalizePlatformId(platform) {
  const key = String(platform || "").toLowerCase().trim();
  if (key === "google_business" || key === "google") return "gbp";
  if (key === "x") return "twitter";
  return key;
}

const MAX_MEDIA = 4;

function isVideoUrl(url) {
  return url.startsWith("data:video");
}

export function ContentStudio() {
  const {
    authReady,
    token,
    user,
    currentWorkspace,
    drafts,
    setDrafts,
    activeDraft,
    setActiveDraft,
    addToast,
    setAiModalOpen,
    socialAccounts,
  } = useAppStore();

  const workspaceRole = currentWorkspace?.role || "owner";
  const isOwner = workspaceRole === "owner";

  const [title, setTitle] = useState("New Social Campaign");
  const [body, setBody] = useState("");
  // Which connected accounts to publish to — not which platforms. Someone
  // can have more than one connected Facebook Page, so "Instagram vs
  // Facebook" isn't a fine-grained enough choice.
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [mediaUrls, setMediaUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState("instagram");
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Publishing is async on the backend (submit -> poll for a result per
  // platform), so this names which stage is in flight for the button label —
  // otherwise a multi-second publish just looks like the click did nothing.
  const [publishStage, setPublishStage] = useState("");
  const [guardrailAudit, setGuardrailAudit] = useState(null);
  const [checkingGuardrails, setCheckingGuardrails] = useState(false);

  // Scheduling & GBP Local Posts (#13) state
  const [scheduleMode, setScheduleMode] = useState("immediate");
  const [scheduledAtInput, setScheduledAtInput] = useState("");
  const [gbpTopicType, setGbpTopicType] = useState("STANDARD");
  const [gbpCtaAction, setGbpCtaAction] = useState("LEARN_MORE");
  const [gbpCtaUrl, setGbpCtaUrl] = useState("");

  // Approval Pipeline & Post Metrics (#10) state
  const [pipelinePosts, setPipelinePosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [postActionId, setPostActionId] = useState(null);
  const [metricsByPost, setMetricsByPost] = useState({});
  const [refreshingMetricsId, setRefreshingMetricsId] = useState(null);

  async function handleCheckGuardrails() {
    if (!body.trim()) {
      return addToast("info", "Please enter post copy first to audit against brand guardrails");
    }
    setCheckingGuardrails(true);
    try {
      const res = await api.guardrails.checkDraft({
        content: body,
        channel: previewPlatform,
      });
      setGuardrailAudit(res);
      addToast(
        res.passed ? "success" : "info",
        `Guardrail check: ${res.score}/100 (${res.passed ? "Passed" : "Issues flagged"})`
      );
    } catch (err) {
      addToast("error", err.message || "Failed to check guardrails");
    } finally {
      setCheckingGuardrails(false);
    }
  }

  // Draft metadata stores platform types (instagram, facebook, twitter, linkedin, gbp) —
  // derive that list cleanly from selected connected accounts.
  const selectedPlatforms = Array.from(
    new Set(
      selectedAccountIds
        .map((id) => normalizePlatformId(socialAccounts.find((a) => a.id === id)?.platform))
        .filter(Boolean)
    )
  );
  const hasGbpSelected = selectedPlatforms.includes("gbp");

  const gbpOptionsPayload = hasGbpSelected
    ? {
        topicType: gbpTopicType,
        ...(gbpCtaAction
          ? {
              callToAction: {
                actionType: gbpCtaAction,
                ...(gbpCtaUrl.trim() ? { url: gbpCtaUrl.trim() } : {}),
              },
            }
          : {}),
      }
    : {};

  // The account the Live Feed Preview labels itself with — prefer a selected
  // account for the previewed platform, otherwise any connected one.
  const previewAccount =
    socialAccounts.find(
      (a) =>
        normalizePlatformId(a.platform) === normalizePlatformId(previewPlatform) &&
        selectedAccountIds.includes(a.id)
    ) ||
    socialAccounts.find(
      (a) => normalizePlatformId(a.platform) === normalizePlatformId(previewPlatform)
    ) ||
    null;

  useEffect(() => {
    if (authReady && user) {
      loadDrafts();
      loadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, token, user, currentWorkspace]);

  // Default to every connected account when starting a fresh (non-draft) post.
  useEffect(() => {
    if (!activeDraft && socialAccounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(socialAccounts.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialAccounts]);

  useEffect(() => {
    if (activeDraft) {
      setTitle(activeDraft.title);
      setBody(activeDraft.body);
      const platforms =
        activeDraft.platforms.length > 0
          ? activeDraft.platforms.map(normalizePlatformId)
          : ["instagram", "facebook"];
      setSelectedAccountIds(
        socialAccounts
          .filter((a) => platforms.includes(normalizePlatformId(a.platform)))
          .map((a) => a.id)
      );
      setMediaUrls(activeDraft.mediaUrls || []);
      setPreviewMediaIndex(0);
      setGuardrailAudit(activeDraft.aiMetadata?.guardrails || null);
      if (platforms[0]) setPreviewPlatform(platforms[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraft, socialAccounts]);

  async function loadDrafts() {
    try {
      const items = await api.content.list();
      setDrafts(items);
      // Deliberately not auto-selecting a saved draft here — the compose box
      // should start blank on load. Users open a saved draft explicitly by
      // clicking it in the "Saved Drafts" list below.
    } catch (err) {
      // fallback
    }
  }

  async function loadPosts() {
    setLoadingPosts(true);
    try {
      const items = await api.posts.list();
      setPipelinePosts(items);
    } catch (err) {
      // fallback
    } finally {
      setLoadingPosts(false);
    }
  }

  function toggleAccount(accountId) {
    const account = socialAccounts.find((a) => a.id === accountId);
    const normalizedAccPlatform = normalizePlatformId(account?.platform);
    if (selectedAccountIds.includes(accountId)) {
      if (selectedAccountIds.length === 1) return addToast("info", "At least one account must be selected");
      const remainingIds = selectedAccountIds.filter((id) => id !== accountId);
      setSelectedAccountIds(remainingIds);
      if (account && normalizePlatformId(previewPlatform) === normalizedAccPlatform) {
        const stillHasPlatform = remainingIds.some(
          (id) => normalizePlatformId(socialAccounts.find((a) => a.id === id)?.platform) === normalizedAccPlatform
        );
        if (!stillHasPlatform) {
          const remainingPlatform = normalizePlatformId(
            socialAccounts.find((a) => remainingIds.includes(a.id))?.platform
          );
          if (remainingPlatform) setPreviewPlatform(remainingPlatform);
        }
      }
    } else {
      setSelectedAccountIds([...selectedAccountIds, accountId]);
      if (normalizedAccPlatform) setPreviewPlatform(normalizedAccPlatform);
    }
  }

  async function handleSaveDraft() {
    if (!title.trim()) return addToast("error", "Draft title is required");
    if (!body.trim()) return addToast("error", "Draft body is required");

    setLoading(true);
    try {
      if (activeDraft?._id) {
        const updated = await api.content.update(activeDraft._id, {
          title,
          body,
          platforms: selectedPlatforms,
          mediaUrls,
        });
        setActiveDraft(updated);
        addToast("success", "Draft updated successfully!");
      } else {
        const created = await api.content.create({
          title,
          body,
          platforms: selectedPlatforms,
          mediaUrls,
        });
        setActiveDraft(created);
        addToast("success", "New draft created!");
      }
      loadDrafts();
    } catch (err) {
      addToast("error", err.message || "Failed to save draft");
    } finally {
      setLoading(false);
    }
  }

  function getValidatedScheduledIso() {
    if (scheduleMode !== "scheduled") return null;
    if (!scheduledAtInput) {
      addToast("error", "Select a date and time to schedule this post");
      return undefined;
    }
    const ts = new Date(scheduledAtInput).getTime();
    if (Number.isNaN(ts) || ts <= Date.now()) {
      addToast("error", "Scheduled time must be in the future");
      return undefined;
    }
    return new Date(scheduledAtInput).toISOString();
  }

  async function handlePublishNow() {
    if (!body.trim()) return addToast("error", "Please write post content before publishing");
    if (selectedAccountIds.length === 0) {
      return addToast("error", "Connect a social account first — see the Social Accounts page.");
    }
    if (!isOwner) {
      return addToast("error", "Only workspace owners can publish posts.");
    }

    const scheduledIso = getValidatedScheduledIso();
    if (scheduledIso === undefined) return;

    setPublishing(true);
    setPublishStage(scheduledIso ? "Scheduling…" : "Submitting…");
    try {
      let draftId = activeDraft?._id;
      if (draftId) {
        const updated = await api.content.update(draftId, {
          title,
          body,
          platforms: selectedPlatforms,
          mediaUrls,
        });
        setActiveDraft(updated);
      } else {
        const created = await api.content.create({
          title,
          body,
          platforms: selectedPlatforms,
          mediaUrls,
        });
        draftId = created._id;
        setActiveDraft(created);
      }

      const res = await api.publish.now({
        contentDraftId: draftId,
        socialAccountIds: selectedAccountIds,
        ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
        ...(Object.keys(gbpOptionsPayload).length > 0 ? { options: gbpOptionsPayload } : {}),
      });

      const items = Array.isArray(res.items) ? res.items : [res];
      const scheduledItems = items.filter((item) => item.status === "scheduled");
      const immediateItems = items.filter((item) => item.status !== "scheduled");

      if (scheduledItems.length > 0) {
        const labels = scheduledItems.map(
          (item) => socialAccounts.find((a) => a.id === item.socialAccountId)?.displayName || item.platform
        );
        addToast(
          "success",
          `Scheduled for ${labels.join(", ")} (${new Date(scheduledIso).toLocaleString()})`
        );
      }

      if (immediateItems.length > 0) {
        setPublishStage("Publishing…");
        const results = await Promise.all(
          immediateItems.map(async (item) => ({
            account: socialAccounts.find((a) => a.id === item.socialAccountId) || {
              displayName: item.platform,
            },
            result: await api.publish.waitForResult(item.postId),
          }))
        );

        const succeeded = results
          .filter((r) => r.result.status === "published")
          .map((r) => r.account.displayName);
        const failed = results.filter((r) => r.result.status !== "published");

        if (succeeded.length > 0) {
          addToast("success", `🚀 Published to ${succeeded.join(", ")} successfully!`);
        }
        failed.forEach((f) => {
          addToast(
            "error",
            `Failed to publish to ${f.account.displayName}: ${
              f.result.errorMessage || "Publishing did not complete"
            }`
          );
        });
      }

      loadDrafts();
      loadPosts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Publishing failed");
    } finally {
      setPublishing(false);
      setPublishStage("");
    }
  }

  async function handlePublishPipelinePost(post) {
    setPostActionId(post.id);
    try {
      const res = await api.posts.publishNow(post.id);
      if (res.status === "scheduled") {
        addToast("success", `Scheduled ${post.channel} post via queue`);
      } else {
        const result = await api.publish.waitForResult(res.postId || post.id);
        if (result.status === "published") {
          addToast("success", `Published ${post.channel} post successfully!`);
        } else {
          addToast("error", result.errorMessage || "Publishing did not complete");
        }
      }
      loadPosts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Publish failed");
    } finally {
      setPostActionId(null);
    }
  }

  async function handlePublishAllApproved() {
    setPostActionId("batch");
    try {
      const res = await api.posts.publishApproved();
      if (!res.queuedCount) {
        addToast("info", "No approved posts waiting to publish");
        return;
      }

      const items = res.items || [];
      const immediate = items.filter((i) => i.status !== "scheduled");
      const scheduled = items.filter((i) => i.status === "scheduled");

      if (scheduled.length > 0) {
        addToast("success", `Queued ${scheduled.length} scheduled approved post(s)`);
      }

      if (immediate.length > 0) {
        const settled = await Promise.allSettled(
          immediate.map(async (item) => ({ item, res: await api.publish.waitForResult(item.postId) }))
        );
        const results = settled
          .filter((s) => s.status === "fulfilled")
          .map((s) => s.value);
        const okCount = results.filter((r) => r.res.status === "published").length;
        const failCount = immediate.length - okCount;
        if (okCount > 0) addToast("success", `Published ${okCount} approved post(s)!`);
        if (failCount > 0) addToast("error", `${failCount} post(s) failed to publish`);
      }

      loadPosts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Batch publish failed");
    } finally {
      setPostActionId(null);
    }
  }

  async function handleToggleMetrics(postId) {
    if (metricsByPost[postId]) {
      setMetricsByPost((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      return;
    }
    setRefreshingMetricsId(postId);
    try {
      const data = await api.posts.getMetrics(postId);
      setMetricsByPost((prev) => ({ ...prev, [postId]: data }));
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Could not load metrics");
    } finally {
      setRefreshingMetricsId(null);
    }
  }

  async function handleRefreshMetrics(postId) {
    setRefreshingMetricsId(postId);
    try {
      const data = await api.posts.refreshMetrics(postId);
      setMetricsByPost((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          postId,
          latestMetrics: data.latestMetrics,
        },
      }));
      addToast("success", "Collected fresh engagement metrics!");
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Could not refresh metrics");
    } finally {
      setRefreshingMetricsId(null);
    }
  }

  function handleCreateNew() {
    setActiveDraft(null);
    setTitle(`Campaign #${drafts.length + 1}`);
    setBody("");
    setSelectedAccountIds(socialAccounts.map((a) => a.id));
    setMediaUrls([]);
    setPreviewMediaIndex(0);
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const room = MAX_MEDIA - mediaUrls.length;
    if (room <= 0) {
      return addToast("info", `You can attach up to ${MAX_MEDIA} files per post`);
    }
    const filesToUpload = files.slice(0, room);
    if (files.length > filesToUpload.length) {
      addToast("info", `Only added ${filesToUpload.length} of ${files.length} files (max ${MAX_MEDIA} per post)`);
    }

    setUploading(true);
    try {
      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append("files", file));
      const res = await api.content.uploadMedia(formData);
      setMediaUrls((prev) => [...prev, ...(res.mediaUrls || [])]);
    } catch (err) {
      addToast("error", err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveMedia(index) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
    setPreviewMediaIndex(0);
  }

  async function handleDeleteDraft(id) {
    try {
      await api.content.delete(id);
      addToast("info", "Draft deleted");
      if (activeDraft?._id === id) {
        handleCreateNew();
      }
      loadDrafts();
    } catch (err) {
      addToast("error", "Could not delete draft");
    }
  }

  const activeMediaUrl = mediaUrls[previewMediaIndex] ?? mediaUrls[0];
  const previewTabs =
    selectedPlatforms.length > 0 ? selectedPlatforms : PLATFORMS.map((p) => p.id);
  const effectivePreviewPlatform = previewTabs.includes(normalizePlatformId(previewPlatform))
    ? normalizePlatformId(previewPlatform)
    : previewTabs[0];

  const approvedCount = pipelinePosts.filter((p) => p.status === "approved").length;
  const filteredPipelinePosts =
    pipelineFilter === "all"
      ? pipelinePosts
      : pipelinePosts.filter((p) => p.status === pipelineFilter);

  if (!authReady) {
    return <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading studio...</div>;
  }

  if (!user) {
    return (
      <SignInPrompt title="Sign in to create posts">
        Drafts, AI captions and publishing all belong to a business profile, so you need to be signed in first.
      </SignInPrompt>
    );
  }

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Omnichannel Content Studio</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Craft, preview, repurpose with AI, and publish to all networks in sync.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Draft</span>
          </button>

          <button
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/40 text-purple-200 hover:border-purple-400 text-xs font-semibold transition"
          >
            <SparklesIcon className="w-4 h-4 text-purple-400" />
            <span>Write with AI</span>
          </button>

          <button
            onClick={handlePublishNow}
            disabled={loading || publishing || !isOwner}
            title={!isOwner ? "Only workspace owners can publish directly" : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {publishing ? (
              <>
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                <span>{publishStage || "Publishing…"}</span>
              </>
            ) : scheduleMode === "scheduled" ? (
              <>
                <ClockIcon className="w-4 h-4" />
                <span>Schedule Post</span>
              </>
            ) : (
              <>
                <SendIcon className="w-4 h-4" />
                <span>Publish Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Editor (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Target Accounts Bar — one toggle per connected account, since a
              user can have more than one Page per platform */}
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Publish Destinations
              </span>
              <Link
                href="/dashboard/accounts?connect=1"
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
              >
                + Connect Channel
              </Link>
            </div>
            {socialAccounts.length === 0 ? (
              <p className="text-xs text-slate-500">
                No accounts connected yet.{" "}
                <Link href="/dashboard/accounts?walkthrough=1" className="text-indigo-400 hover:text-indigo-300">
                  Open Setup Walkthrough (#08, F27)
                </Link>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {socialAccounts.map((account) => {
                  const platformMeta = PLATFORMS.find(
                    (p) => p.id === normalizePlatformId(account.platform)
                  );
                  const Icon = platformMeta?.icon || FacebookIcon;
                  const isSelected = selectedAccountIds.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      onClick={() => toggleAccount(account.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-md border text-xs font-semibold transition-all text-left ${
                        isSelected
                          ? platformMeta?.color || "text-slate-200 border-slate-600 bg-slate-800/60"
                          : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{account.displayName}</span>
                      {isSelected && <CheckIcon className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Editor Body */}
          <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Campaign Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 AI Platform Launch"
                className="w-full px-3.5 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-400">Post Copy</label>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>{body.length} characters</span>
                </div>
              </div>
              <textarea
                rows={7}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (guardrailAudit) setGuardrailAudit(null);
                }}
                placeholder='Write your post here or click "Write with AI" to generate captions, hashtags, and variations...'
                className="w-full px-4 py-3 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />

              {/* Guardrails Check Trigger & Audit Panel */}
              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleCheckGuardrails}
                    disabled={checkingGuardrails || !body.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 disabled:opacity-40 transition"
                  >
                    <span>🛡️</span>
                    <span>{checkingGuardrails ? "Checking Brand Guardrails..." : "Check Brand Guardrails"}</span>
                  </button>

                  {guardrailAudit && (
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        guardrailAudit.passed
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      Score: {guardrailAudit.score}/100 — {guardrailAudit.passed ? "PASSED" : "ISSUES FLAGGED"}
                    </span>
                  )}
                </div>

                {guardrailAudit && (
                  <div className="mt-3 p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Tone Match</span>
                        <span className={guardrailAudit.tone?.passed ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                          {guardrailAudit.tone?.passed ? "✓ Matches Profile" : "✗ Tone Drift Detected"}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Target: {guardrailAudit.tone?.targetTone?.join(", ") || "professional"}
                        </p>
                      </div>

                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Banned Claims</span>
                        <span className={guardrailAudit.bannedClaims?.passed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                          {guardrailAudit.bannedClaims?.passed ? "✓ Clear" : `✗ ${guardrailAudit.bannedClaims?.violations?.length} Violation(s)`}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          No unauthorized guarantees or baseline claims
                        </p>
                      </div>

                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Disclosures</span>
                        <span className={guardrailAudit.disclosures?.passed ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                          {guardrailAudit.disclosures?.passed ? "✓ Clear" : `✗ Missing Disclosures`}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          FTC #ad / #sponsored / legal tags
                        </p>
                      </div>
                    </div>

                    {guardrailAudit.violations?.length > 0 && (
                      <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] space-y-1">
                        <span className="font-bold block">Issues to Resolve:</span>
                        {guardrailAudit.violations.map((v, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span>•</span>
                            <span>{v.message || v.reason || v.phrase || "Policy violation"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-900 pt-1.5">
                      <span>Approval remains mandatory even when guardrails pass.</span>
                      <span className="text-indigo-400 font-medium">Safety Net Active</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Media Attachment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-400">Photos or Videos</label>
                <span className="text-[10px] text-slate-500">{mediaUrls.length}/{MAX_MEDIA} attached</span>
              </div>

              {mediaUrls.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {mediaUrls.map((url, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-md overflow-hidden bg-slate-900 border border-slate-800 shrink-0"
                    >
                      {isVideoUrl(url) ? (
                        <video src={url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={url} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" />
                      )}
                      <button
                        onClick={() => handleRemoveMedia(i)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-slate-950/80 text-slate-300 hover:text-rose-400 text-[10px] leading-none flex items-center justify-center"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {mediaUrls.length < MAX_MEDIA ? (
                <label className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-md bg-slate-950 border border-dashed border-slate-800 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-300 cursor-pointer transition">
                  <span className="text-xs font-semibold">
                    {uploading ? "Uploading..." : mediaUrls.length > 0 ? "Add another image or video" : "Click to upload an image or video"}
                  </span>
                  <span className="text-[10px] text-slate-600">JPG, PNG, MP4 up to 25MB each, {MAX_MEDIA} max</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFilesSelected}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              ) : (
                <p className="text-[10px] text-slate-600 text-center py-1">Maximum of {MAX_MEDIA} files reached</p>
              )}
            </div>

            {/* Publishing Schedule & Channel Options */}
            <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Publishing Schedule</span>
                </span>
                <div className="flex items-center gap-1 p-0.5 rounded bg-slate-900 border border-slate-800 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("immediate")}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                      scheduleMode === "immediate"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Publish Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("scheduled")}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                      scheduleMode === "scheduled"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Schedule for Later
                  </button>
                </div>
              </div>

              {scheduleMode === "scheduled" && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Scheduled Date &amp; Time (queued via BullMQ / job queue)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAtInput}
                    onChange={(e) => setScheduledAtInput(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {hasGbpSelected && (
                <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <GoogleIcon className="w-3.5 h-3.5" />
                    <span>Google Business Profile Local Post (#13) Options</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">Topic Type</label>
                      <select
                        value={gbpTopicType}
                        onChange={(e) => setGbpTopicType(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="STANDARD">Standard Update</option>
                        <option value="EVENT">Event</option>
                        <option value="OFFER">Special Offer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">Call to Action</label>
                      <select
                        value={gbpCtaAction}
                        onChange={(e) => setGbpCtaAction(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">None</option>
                        <option value="LEARN_MORE">Learn More</option>
                        <option value="ORDER">Order Online</option>
                        <option value="BOOK">Book</option>
                        <option value="SIGN_UP">Sign Up</option>
                        <option value="CALL">Call Now</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        CTA URL (optional)
                      </label>
                      <input
                        type="url"
                        value={gbpCtaUrl}
                        onChange={(e) => setGbpCtaUrl(e.target.value)}
                        placeholder="https://yourbusiness.com"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Editor Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={loading || publishing}
                  className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving…" : "Save as Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Feed Previews (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                Live Feed Preview
              </span>
              {/* Preview platform selector */}
              <div className="flex flex-wrap items-center gap-1 p-0.5 rounded bg-slate-950 border border-slate-800">
                {previewTabs.map((plt) => {
                  const meta = PLATFORMS.find((p) => p.id === plt);
                  return (
                    <button
                      key={plt}
                      type="button"
                      onClick={() => setPreviewPlatform(plt)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                        effectivePreviewPlatform === plt
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {meta?.label || plt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feed Card Simulation */}
            <div className="rounded-md bg-slate-950 border border-slate-800 p-4">
              {/* Instagram Preview */}
              {effectivePreviewPlatform === "instagram" && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                        <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-[10px] font-bold text-white">
                          TP
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white">
                        {previewAccount?.displayName || "Connect an Instagram account"}
                      </span>
                    </div>
                    <span className="text-slate-500">•••</span>
                  </div>

                  {activeMediaUrl ? (
                    <div className="relative rounded-md overflow-hidden border border-slate-800 max-h-64 bg-slate-900">
                      {isVideoUrl(activeMediaUrl) ? (
                        <video src={activeMediaUrl} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={activeMediaUrl} alt="Instagram post" className="w-full h-full object-cover" />
                      )}
                      {mediaUrls.length > 1 && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] text-white">
                          <LayersIcon className="w-3 h-3" />
                          {previewMediaIndex + 1}/{mediaUrls.length}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="h-44 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-xs text-slate-500">
                      Upload media for Instagram post
                    </div>
                  )}

                  {mediaUrls.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {mediaUrls.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewMediaIndex(i)}
                          className={`w-1.5 h-1.5 rounded-full ${i === previewMediaIndex ? "bg-indigo-400" : "bg-slate-700"}`}
                          title={`Show media ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <span>❤️</span>
                      <span>💬</span>
                      <span>✈️</span>
                    </div>
                    <p className="text-xs text-slate-200 line-clamp-3">
                      <strong className="text-white mr-1.5">
                        {previewAccount?.displayName || "your_account"}
                      </strong>
                      {body || "Your Instagram caption and hashtags..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Facebook Preview */}
              {effectivePreviewPlatform === "facebook" && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      TP
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {previewAccount?.displayName || "Connect a Facebook Page"}
                      </div>
                      <span className="text-[10px] text-slate-500">Public · Just now</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {body || "Your Facebook post copy..."}
                  </p>

                  {activeMediaUrl && (
                    <div className="relative rounded-md overflow-hidden border border-slate-800 max-h-56 bg-slate-900">
                      {isVideoUrl(activeMediaUrl) ? (
                        <video src={activeMediaUrl} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={activeMediaUrl} alt="Facebook media" className="w-full h-full object-cover" />
                      )}
                      {mediaUrls.length > 1 && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] text-white">
                          <LayersIcon className="w-3 h-3" />
                          {previewMediaIndex + 1}/{mediaUrls.length}
                        </span>
                      )}
                    </div>
                  )}

                  {mediaUrls.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {mediaUrls.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewMediaIndex(i)}
                          className={`w-1.5 h-1.5 rounded-full ${i === previewMediaIndex ? "bg-indigo-400" : "bg-slate-700"}`}
                          title={`Show media ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                    <span>👍 86 · 💬 14 shares</span>
                  </div>
                </div>
              )}

              {/* Twitter / X Preview */}
              {effectivePreviewPlatform === "twitter" && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
                        <TwitterIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {previewAccount?.displayName || "Connect a Twitter / X Account"}
                        </div>
                        <span className="text-[10px] text-slate-500">Just now</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono ${
                        body.length > 280 ? "text-rose-400" : "text-slate-400"
                      }`}
                    >
                      {body.length}/280
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {body || "Your X / Twitter post copy..."}
                  </p>

                  {activeMediaUrl && (
                    <div className="rounded-md overflow-hidden border border-slate-800 max-h-52 bg-slate-900">
                      {isVideoUrl(activeMediaUrl) ? (
                        <video src={activeMediaUrl} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={activeMediaUrl} alt="Twitter media" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-6 text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                    <span>💬 12</span>
                    <span>🔁 24</span>
                    <span>❤️ 94</span>
                  </div>
                </div>
              )}

              {/* LinkedIn Preview */}
              {effectivePreviewPlatform === "linkedin" && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
                      <LinkedInIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {previewAccount?.displayName || "Connect a LinkedIn Page"}
                      </div>
                      <span className="text-[10px] text-slate-500">Company Update · Just now</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {body || "Your LinkedIn post copy..."}
                  </p>

                  {activeMediaUrl && (
                    <div className="rounded-md overflow-hidden border border-slate-800 max-h-56 bg-slate-900">
                      {isVideoUrl(activeMediaUrl) ? (
                        <video src={activeMediaUrl} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={activeMediaUrl} alt="LinkedIn media" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                    <span>👍 💡 48 reactions</span>
                    <span>8 comments · 5 reposts</span>
                  </div>
                </div>
              )}

              {/* Google Business Profile Local Post (#13) Preview */}
              {effectivePreviewPlatform === "gbp" && (
                <div className="space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                        <GoogleIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {previewAccount?.displayName || "Google Business Location (#13)"}
                        </div>
                        <span className="text-[10px] text-slate-500">Google Search &amp; Maps · Local Post</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                      {gbpTopicType}
                    </span>
                  </div>

                  {activeMediaUrl && !isVideoUrl(activeMediaUrl) && (
                    <div className="rounded-md overflow-hidden border border-slate-800 max-h-52 bg-slate-900">
                      <img src={activeMediaUrl} alt="GBP Local Post photo" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {body || "Your Google Business Profile local update, offer, or announcement..."}
                  </p>

                  {gbpCtaAction && (
                    <div className="pt-1">
                      <span className="inline-flex items-center px-3 py-1.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-semibold">
                        {GBP_CTA_LABELS[gbpCtaAction] || gbpCtaAction}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Drafts Repository List */}
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Saved Drafts ({drafts.length})
            </span>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {drafts.map((d) => (
                <div
                  key={d._id}
                  onClick={() => setActiveDraft(d)}
                  className={`p-3 rounded-md border text-xs cursor-pointer transition flex items-center justify-between ${
                    activeDraft?._id === d._id
                      ? "bg-indigo-950/40 border-indigo-500/50 text-white"
                      : "bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{d.title}</span>
                      {d.aiMetadata?.guardrails && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                            d.aiMetadata.guardrails.passed
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                          }`}
                          title={
                            d.aiMetadata.guardrails.passed
                              ? `Guardrails passed (${d.aiMetadata.guardrails.score}/100)`
                              : `${d.aiMetadata.guardrails.violations?.length || 1} guardrail violation(s) flagged`
                          }
                        >
                          {d.aiMetadata.guardrails.passed ? "✓ Safe" : "⚠️ Flagged"}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{d.body}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDraft(d._id);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Delete Draft"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Publishing Pipeline, Approvals & Post Metrics (#10) */}
      <div className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChartIcon className="w-4 h-4 text-indigo-400" />
              <span>Publishing Pipeline &amp; Engagement Metrics (#10)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Track approvals, scheduled queue jobs, retries, and collected metrics across every connected channel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && approvedCount > 0 && (
              <button
                type="button"
                onClick={handlePublishAllApproved}
                disabled={postActionId === "batch"}
                className="px-3.5 py-1.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition flex items-center gap-1.5 disabled:opacity-60"
              >
                <SendIcon className="w-3.5 h-3.5" />
                <span>
                  {postActionId === "batch"
                    ? "Queuing…"
                    : `Publish All Approved (${approvedCount})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={loadPosts}
              disabled={loadingPosts}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition flex items-center gap-1.5"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${loadingPosts ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All" },
            { id: "approved", label: "Approved" },
            { id: "scheduled", label: "Scheduled" },
            { id: "published", label: "Published" },
            { id: "failed", label: "Failed" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPipelineFilter(tab.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                pipelineFilter === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredPipelinePosts.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-md">
            No pipeline posts match this filter. Posts approved for publishing appear here with live queue tracking and engagement metrics.
          </div>
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {filteredPipelinePosts.map((post) => {
              const normChannel = normalizePlatformId(post.channel);
              const platformMeta = PLATFORMS.find((p) => p.id === normChannel);
              const Icon = platformMeta?.icon || SparklesIcon;
              const statusStyle =
                PIPELINE_STATUS_STYLES[post.status] || PIPELINE_STATUS_STYLES.draft;
              const isBusy = postActionId === post.id;
              const metricsData = metricsByPost[post.id];
              const latestMetrics = metricsData?.latestMetrics;

              return (
                <div
                  key={post.id}
                  className="p-3.5 rounded-md bg-slate-950 border border-slate-800 space-y-2.5 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`p-1.5 rounded border ${platformMeta?.color || "border-slate-700 text-slate-300"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white truncate">
                            {post.content?.title || `${normChannel} Post`}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${statusStyle}`}
                          >
                            {post.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {post.content?.body}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {(post.status === "approved" || post.status === "failed") && isOwner && (
                        <button
                          type="button"
                          onClick={() => handlePublishPipelinePost(post)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                        >
                          {isBusy
                            ? "Queuing…"
                            : post.status === "failed"
                            ? "Retry Publish"
                            : "Publish Now"}
                        </button>
                      )}
                      {post.status === "published" && (
                        <button
                          type="button"
                          onClick={() => handleToggleMetrics(post.id)}
                          disabled={refreshingMetricsId === post.id}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 font-semibold transition flex items-center gap-1"
                        >
                          <BarChartIcon className="w-3 h-3" />
                          <span>{metricsData ? "Hide Metrics" : "Metrics"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {post.scheduledAt && (
                    <div className="text-[11px] text-sky-300 flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5" />
                      <span>Scheduled: {new Date(post.scheduledAt).toLocaleString()}</span>
                    </div>
                  )}

                  {post.errorMessage && (
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                      {post.errorMessage}
                    </div>
                  )}

                  {metricsData && (
                    <div className="p-3 rounded bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {latestMetrics ? (
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300 font-mono">
                          <span>👁️ Reach: <strong className="text-white">{latestMetrics.reach}</strong></span>
                          <span>❤️ Likes: <strong className="text-white">{latestMetrics.likes}</strong></span>
                          <span>💬 Comments: <strong className="text-white">{latestMetrics.comments}</strong></span>
                          <span>🔁 Shares: <strong className="text-white">{latestMetrics.shares}</strong></span>
                          <span>🔗 Clicks: <strong className="text-white">{latestMetrics.clicks}</strong></span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          No metrics snapshot captured yet — click Collect Metrics to query the channel adapter.
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRefreshMetrics(post.id)}
                        disabled={refreshingMetricsId === post.id}
                        className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-semibold transition self-start sm:self-auto"
                      >
                        {refreshingMetricsId === post.id ? "Collecting…" : "Collect Fresh Metrics"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Assistant Modal */}
      <AIModal
        initialContent={body}
        onInsert={(text) => setBody((prev) => (prev ? `${prev}\n\n${text}` : text))}
        onDraftCreated={() => {
          loadDrafts();
          loadPosts();
        }}
      />
    </div>
  );
}
