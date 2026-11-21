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
import { can } from "../lib/roles";
import { SetupWalkthroughModal } from "./SetupWalkthroughModal";

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
  SHOP: "Shop",
  SIGN_UP: "Sign Up",
  CALL: "Call Now",
};

const PIPELINE_STATUS_STYLES = {
  draft: "bg-slate-800 text-slate-300 border-slate-700",
  pending_approval: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  approved: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  changes_requested: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  rejected: "bg-rose-500/10 text-rose-300 border-rose-500/30",
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

// How the latest approval step reads next to its comment in the pipeline.
const APPROVAL_STEP_WORDS = {
  submit: "note",
  request_changes: "changes requested",
  approve: "approved",
  reject: "rejected",
};

// How each step reads in a post's history.
const HISTORY_WORDS = {
  submit: "submitted it for approval",
  request_changes: "asked for changes",
  approve: "approved it",
  reject: "rejected it",
};

// Statuses an editor can pick a post back up from and resubmit.
const REVISABLE = ["draft", "changes_requested", "rejected"];

/** An ISO date as the value a datetime-local input expects, in local time. */
function toDateTimeLocal(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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

  // What this person may do in the open business (F10), from the permissions
  // the API returns with it. No permissions loaded means nothing is allowed.
  const canWrite = can(currentWorkspace, "post.write");
  const canPublish = can(currentWorkspace, "post.publish");
  const canSubmit = can(currentWorkspace, "post.submit");
  const canReview = can(currentWorkspace, "post.review");
  const canManageAccounts = can(currentWorkspace, "accounts.manage");
  // The owner deletes any post; editors only their own drafts.
  const canDeleteAny = can(currentWorkspace, "post.delete");
  // Editors send posts to the owner instead of publishing them.
  const sendsForApproval = canSubmit && !canPublish;

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
  const [gbpEventTitle, setGbpEventTitle] = useState("");
  const [gbpStartDate, setGbpStartDate] = useState("");
  const [gbpEndDate, setGbpEndDate] = useState("");
  const [gbpCouponCode, setGbpCouponCode] = useState("");
  const [gbpRedeemUrl, setGbpRedeemUrl] = useState("");
  const [gbpTerms, setGbpTerms] = useState("");
  const [gbpAlertType, setGbpAlertType] = useState("COVID_19");
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);

  // Approval Pipeline & Post Metrics (#10) state
  const [pipelinePosts, setPipelinePosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [postActionId, setPostActionId] = useState(null);
  const [metricsByPost, setMetricsByPost] = useState({});
  const [refreshingMetricsId, setRefreshingMetricsId] = useState(null);

  // Editor: the note sent with a post, and the post being revised after the
  // owner sent it back (changes requested or rejected).
  const [approvalNote, setApprovalNote] = useState("");
  const [revisingPost, setRevisingPost] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Owner: the comment typed while reviewing each post, by post id.
  const [reviewComments, setReviewComments] = useState({});
  // Each open post history (the audit trail of who did what), by post id.
  const [historyByPost, setHistoryByPost] = useState({});

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

  // Check if any selected GBP account is unverified (#13 verification guardrail)
  const unverifiedGbpAccount = selectedAccountIds
    .map((id) => socialAccounts.find((a) => a.id === id))
    .find(
      (a) =>
        normalizePlatformId(a?.platform) === "gbp" &&
        (!a?.isVerified || a?.verificationState !== "VERIFIED")
    );

  const gbpOptionsPayload = hasGbpSelected
    ? {
        topicType: gbpTopicType,
        ...(gbpCtaAction
          ? {
              callToAction: {
                actionType: gbpCtaAction,
                ...(gbpCtaAction !== "CALL" && gbpCtaUrl.trim() ? { url: gbpCtaUrl.trim() } : {}),
              },
            }
          : {}),
        ...(gbpTopicType === "EVENT"
          ? {
              event: {
                title: gbpEventTitle.trim() || undefined,
                ...(gbpStartDate
                  ? {
                      startDate: {
                        year: new Date(gbpStartDate).getFullYear(),
                        month: new Date(gbpStartDate).getMonth() + 1,
                        day: new Date(gbpStartDate).getDate(),
                      },
                    }
                  : {}),
                ...(gbpEndDate
                  ? {
                      endDate: {
                        year: new Date(gbpEndDate).getFullYear(),
                        month: new Date(gbpEndDate).getMonth() + 1,
                        day: new Date(gbpEndDate).getDate(),
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...(gbpTopicType === "OFFER"
          ? {
              offer: {
                couponCode: gbpCouponCode.trim() || undefined,
                redeemOnlineUrl: gbpRedeemUrl.trim() || undefined,
                termsConditions: gbpTerms.trim() || undefined,
              },
            }
          : {}),
        ...(gbpTopicType === "ALERT" ? { alertType: gbpAlertType } : {}),
      }
    : {};

  // Fills the schedule and Google Business options from a saved draft or a
  // post being revised, so they aren't lost between saves.
  function restoreSchedule(iso) {
    if (iso) {
      setScheduleMode("scheduled");
      setScheduledAtInput(toDateTimeLocal(iso));
    } else {
      setScheduleMode("immediate");
      setScheduledAtInput("");
    }
  }
  function restoreGbpOptions(options) {
    setGbpTopicType(options?.topicType || "STANDARD");
    // No saved options: the default call to action. Saved without one: none.
    setGbpCtaAction(options ? options.callToAction?.actionType || "" : "LEARN_MORE");
    setGbpCtaUrl(options?.callToAction?.url || "");
  }

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

  // Opening a draft (a draft post of the business, F10) fills the editor.
  useEffect(() => {
    if (activeDraft) {
      setTitle(activeDraft.content?.title || "");
      setBody(activeDraft.content?.body || "");
      const connected = (id) => socialAccounts.some((a) => a.id === id);
      const targets = (activeDraft.targetAccountIds || []).filter(connected);
      const accountIds =
        targets.length > 0
          ? targets
          : activeDraft.socialAccountId && connected(activeDraft.socialAccountId)
          ? [activeDraft.socialAccountId]
          : socialAccounts
              .filter((a) => normalizePlatformId(a.platform) === normalizePlatformId(activeDraft.channel))
              .map((a) => a.id);
      setSelectedAccountIds(accountIds);
      setMediaUrls(activeDraft.content?.mediaUrls || []);
      setPreviewMediaIndex(0);
      setGuardrailAudit(activeDraft.aiMetadata?.guardrails || null);
      restoreSchedule(activeDraft.scheduledAt);
      restoreGbpOptions(activeDraft.aiMetadata?.gbpOptions);
      const firstAccount = socialAccounts.find((a) => a.id === accountIds[0]);
      setPreviewPlatform(normalizePlatformId(firstAccount?.platform || activeDraft.channel));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraft, socialAccounts]);

  async function loadDrafts() {
    try {
      // Drafts are the business's draft posts, shared with the team (F10).
      const items = await api.posts.list({ status: "draft" });
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
      // Drafts are listed under Saved Drafts, not in the pipeline.
      setPipelinePosts(items.filter((p) => p.status !== "draft"));
    } catch (err) {
      // fallback
    } finally {
      setLoadingPosts(false);
    }
  }

  function toggleAccount(accountId) {
    if (revisingPost) {
      return addToast("info", "This post goes to one account. Cancel revising to start a new post.");
    }
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
      const wasNew = !activeDraft?.id;
      await saveDraftPost();
      addToast("success", wasNew ? "New draft created!" : "Draft updated successfully!");
      loadDrafts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Failed to save draft");
    } finally {
      setLoading(false);
    }
  }

  const accountFor = (id) => socialAccounts.find((a) => a.id === id);
  const isGbpAccount = (id) => normalizePlatformId(accountFor(id)?.platform) === "gbp";

  // Saves the editor as a draft post of the business, meant for the selected
  // accounts, and returns it.
  async function saveDraftPost() {
    const fields = {
      title,
      body,
      mediaUrls,
      targetAccountIds: selectedAccountIds,
      channel: accountFor(selectedAccountIds[0])?.platform || previewPlatform,
      scheduledAt: draftScheduleIso(),
    };
    const gbpOptions = hasGbpSelected ? gbpOptionsPayload : null;
    const saved = activeDraft?.id
      ? await api.posts.update(activeDraft.id, { ...fields, gbpOptions })
      : await api.posts.create({ ...fields, ...(gbpOptions ? { aiMetadata: { gbpOptions } } : {}) });
    setActiveDraft(saved);
    return saved;
  }

  // A post goes to one account, so sending a draft makes one post per selected
  // account: the draft itself becomes the first account's post and the others
  // are copies. Each then gets its own approval and publish (F10).
  async function splitDraftIntoPosts(draft, scheduledIso) {
    const [firstId, ...otherIds] = selectedAccountIds;
    const gbpFields = (id) => (isGbpAccount(id) ? { gbpOptions: gbpOptionsPayload } : {});
    const first = await api.posts.update(draft.id, {
      title,
      body,
      mediaUrls,
      scheduledAt: scheduledIso,
      socialAccountId: firstId,
      channel: accountFor(firstId)?.platform,
      targetAccountIds: [],
      ...gbpFields(firstId),
    });
    const copies = await Promise.all(
      otherIds.map((id) =>
        api.posts.create({
          title,
          body,
          mediaUrls,
          scheduledAt: scheduledIso,
          socialAccountId: id,
          channel: accountFor(id)?.platform,
          ...(isGbpAccount(id) ? { aiMetadata: { gbpOptions: gbpOptionsPayload } } : {}),
        })
      )
    );
    return [first, ...copies];
  }

  // The schedule kept on a draft. Unlike sending, a draft may hold a time
  // that's passed; it's checked when the post is sent.
  function draftScheduleIso() {
    if (scheduleMode !== "scheduled" || !scheduledAtInput) return null;
    const d = new Date(scheduledAtInput);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
    if (!canPublish) {
      return addToast("error", "Only the business owner can publish.");
    }

    if (unverifiedGbpAccount) {
      setIsWalkthroughOpen(true);
      return addToast(
        "error",
        "Google Business Profile listing is unverified. Verification takes several business days. Opening Setup Walkthrough (#08, F27)..."
      );
    }

    const scheduledIso = getValidatedScheduledIso();
    if (scheduledIso === undefined) return;

    setPublishing(true);
    setPublishStage(scheduledIso ? "Scheduling…" : "Submitting…");
    try {
      // One publish path: every post is a business post published through
      // /posts/:id/publish-now, so it has approval history and metrics (F10).
      const draft = await saveDraftPost();
      const posts = await splitDraftIntoPosts(draft, scheduledIso);
      setActiveDraft(null);
      const items = await Promise.all(
        posts.map(async (post) => {
          const res = await api.posts.publishNow(post.id, scheduledIso ? { scheduledAt: scheduledIso } : {});
          return { ...res, postId: res.postId || post.id, socialAccountId: post.socialAccountId };
        })
      );

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

      handleCreateNew();
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

  // Editor: sends the post to the owner. A new post becomes one post per
  // selected account; a post being revised is updated and resubmitted.
  async function handleSubmitForApproval() {
    if (!body.trim()) return addToast("error", "Write the post before sending it for approval");
    if (!revisingPost && selectedAccountIds.length === 0) {
      return addToast("error", "Choose at least one account to post to");
    }
    const scheduledIso = getValidatedScheduledIso();
    if (scheduledIso === undefined) return;
    const comment = approvalNote.trim();

    setSubmitting(true);
    try {
      let submitted;
      if (revisingPost) {
        await api.posts.update(revisingPost.id, {
          title,
          body,
          mediaUrls,
          scheduledAt: scheduledIso,
          ...(isGbpAccount(revisingPost.socialAccountId) ? { gbpOptions: gbpOptionsPayload } : {}),
        });
        submitted = [await api.posts.submitApproval(revisingPost.id, { comment })];
      } else {
        const draft = await saveDraftPost();
        const posts = await splitDraftIntoPosts(draft, scheduledIso);
        setActiveDraft(null);
        submitted = await Promise.all(posts.map((post) => api.posts.submitApproval(post.id, { comment })));
      }

      addToast(
        "success",
        submitted.length === 1
          ? "Sent to the owner for approval"
          : `Sent ${submitted.length} posts to the owner for approval`
      );
      const warning = submitted.find((p) => p.guardrailsWarning)?.guardrailsWarning;
      if (warning) addToast("info", warning);
      handleCreateNew();
      loadDrafts();
      loadPosts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Could not send for approval");
    } finally {
      setSubmitting(false);
    }
  }

  // Editor: loads a post the owner sent back into the editor to fix and resubmit.
  function handleRevise(post) {
    setActiveDraft(null);
    setRevisingPost(post);
    setTitle(post.content?.title || "");
    setBody(post.content?.body || "");
    setMediaUrls(post.content?.mediaUrls || []);
    setPreviewMediaIndex(0);
    if (post.socialAccountId) setSelectedAccountIds([post.socialAccountId]);
    setPreviewPlatform(normalizePlatformId(post.channel));
    restoreSchedule(post.scheduledAt);
    restoreGbpOptions(post.aiMetadata?.gbpOptions);
    setApprovalNote("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Owner: approve, send back for changes (comment needed), or reject.
  async function handleReview(post, action) {
    const comment = (reviewComments[post.id] || "").trim();
    if (action === "request_changes" && !comment) {
      return addToast("error", "Add a comment so the editor knows what to change");
    }
    const call = {
      approve: api.posts.approve,
      request_changes: api.posts.requestChanges,
      reject: api.posts.reject,
    }[action];

    setPostActionId(post.id);
    try {
      const updated = await call(post.id, { comment });
      addToast(
        "success",
        action === "approve"
          ? updated.status === "scheduled"
            ? "Approved. It will go out at its scheduled time."
            : "Approved. It's ready to publish."
          : action === "request_changes"
          ? "Sent back to the editor with your comment"
          : "Rejected"
      );
      setReviewComments((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      loadPosts();
    } catch (err) {
      addToast("error", err.response?.data?.error || err.message || "Could not update the post");
    } finally {
      setPostActionId(null);
    }
  }

  // Shows or hides a post's approval history: who submitted, approved, asked
  // for changes or rejected it, when, and what they said (F10 audit trail).
  async function handleToggleHistory(postId) {
    if (historyByPost[postId]) {
      setHistoryByPost((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      return;
    }
    try {
      const post = await api.posts.getById(postId);
      setHistoryByPost((prev) => ({ ...prev, [postId]: post.approvalEvents || [] }));
    } catch (err) {
      addToast("error", err.response?.data?.error || "Could not load the history");
    }
  }

  function accountName(post) {
    return socialAccounts.find((a) => a.id === post.socialAccountId)?.displayName || normalizePlatformId(post.channel);
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
    setRevisingPost(null);
    setApprovalNote("");
    setTitle(`Campaign #${drafts.length + 1}`);
    setBody("");
    setSelectedAccountIds(socialAccounts.map((a) => a.id));
    setMediaUrls([]);
    setPreviewMediaIndex(0);
    restoreSchedule(null);
    restoreGbpOptions(null);
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
      await api.posts.delete(id);
      addToast("info", "Draft deleted");
      if (activeDraft?.id === id) {
        handleCreateNew();
      }
      loadDrafts();
    } catch (err) {
      addToast("error", err.response?.data?.error || "Could not delete draft");
    }
  }

  const activeMediaUrl = mediaUrls[previewMediaIndex] ?? mediaUrls[0];
  const previewTabs =
    selectedPlatforms.length > 0 ? selectedPlatforms : PLATFORMS.map((p) => p.id);
  const effectivePreviewPlatform = previewTabs.includes(normalizePlatformId(previewPlatform))
    ? normalizePlatformId(previewPlatform)
    : previewTabs[0];

  const approvedCount = pipelinePosts.filter((p) => p.status === "approved").length;
  const pendingCount = pipelinePosts.filter((p) => p.status === "pending_approval").length;
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
          {canWrite && (
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Draft</span>
            </button>
          )}

          {canWrite && (
            <button
              onClick={() => setAiModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/40 text-purple-200 hover:border-purple-400 text-xs font-semibold transition"
            >
              <SparklesIcon className="w-4 h-4 text-purple-400" />
              <span>Write with AI</span>
            </button>
          )}

          {canPublish ? (
          <button
            onClick={handlePublishNow}
            disabled={loading || publishing}
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
          ) : sendsForApproval ? (
            <button
              onClick={handleSubmitForApproval}
              disabled={loading || submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
              <span>{submitting ? "Sending…" : revisingPost ? "Resubmit for Approval" : "Submit for Approval"}</span>
            </button>
          ) : (
            <span className="px-3 py-2 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-400">
              View only: viewers can see posts but not change them
            </span>
          )}
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Editor (7 cols). Read-only for viewers. */}
        <fieldset disabled={!canWrite} className="lg:col-span-7 space-y-5 min-w-0">
          {/* Target Accounts Bar — one toggle per connected account, since a
              user can have more than one Page per platform */}
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Publish Destinations
              </span>
              {canManageAccounts && (
                <Link
                  href="/dashboard/accounts?connect=1"
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  + Connect Channel
                </Link>
              )}
            </div>
            {socialAccounts.length === 0 ? (
              <p className="text-xs text-slate-500">
                No accounts connected yet.{" "}
                {canManageAccounts ? (
                  <>
                    <Link href="/dashboard/accounts?walkthrough=1" className="text-indigo-400 hover:text-indigo-300">
                      Open Setup Walkthrough (#08, F27)
                    </Link>
                    .
                  </>
                ) : (
                  "Ask the business owner to connect one."
                )}
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
            {revisingPost && (
              <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/30 text-xs text-orange-200 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Revising &ldquo;{revisingPost.content?.title || "Untitled post"}&rdquo; for {accountName(revisingPost)}
                  </span>
                  <button type="button" onClick={handleCreateNew} className="text-orange-300 hover:text-white underline shrink-0">
                    Cancel
                  </button>
                </div>
                {revisingPost.lastApprovalEvent?.comment && (
                  <p className="text-orange-100/90">
                    {revisingPost.lastApprovalEvent.actorName}: &ldquo;{revisingPost.lastApprovalEvent.comment}&rdquo;
                  </p>
                )}
              </div>
            )}
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
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <GoogleIcon className="w-3.5 h-3.5" />
                      <span>Google Business Profile Local Post (#13) Options</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Search &amp; Maps</span>
                  </div>

                  {unverifiedGbpAccount && (
                    <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚠️</span>
                        <span>
                          <strong>Listing Verification Required:</strong> {unverifiedGbpAccount.displayName || "Google Business Profile"} is unverified. Verification takes several business days.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsWalkthroughOpen(true)}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/40 text-[11px] font-semibold transition shrink-0"
                      >
                        Setup Walkthrough (#08, F27) →
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        Topic Type (4 GBP post types)
                      </label>
                      <select
                        value={gbpTopicType}
                        onChange={(e) => setGbpTopicType(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="STANDARD">Standard Update</option>
                        <option value="EVENT">Event</option>
                        <option value="OFFER">Special Offer</option>
                        <option value="ALERT">COVID-19 / Safety Alert</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        Call to Action (CTA Button)
                      </label>
                      <select
                        value={gbpCtaAction}
                        onChange={(e) => setGbpCtaAction(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="">None</option>
                        <option value="LEARN_MORE">Learn More</option>
                        <option value="ORDER">Order Online</option>
                        <option value="BOOK">Book</option>
                        <option value="SHOP">Shop</option>
                        <option value="SIGN_UP">Sign Up</option>
                        <option value="CALL">Call Now (Uses listing phone)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        CTA Target URL {gbpCtaAction === "CALL" ? "(Not needed for Call)" : ""}
                      </label>
                      <input
                        type="url"
                        disabled={gbpCtaAction === "CALL" || !gbpCtaAction}
                        value={gbpCtaUrl}
                        onChange={(e) => setGbpCtaUrl(e.target.value)}
                        placeholder={gbpCtaAction === "CALL" ? "Uses listing phone" : "https://yourbusiness.com/deal"}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-40"
                      />
                    </div>
                  </div>

                  {/* EVENT specific fields */}
                  {gbpTopicType === "EVENT" && (
                    <div className="p-3 rounded-md bg-slate-950/60 border border-slate-800 space-y-2">
                      <span className="text-[11px] font-semibold text-amber-300">Event Details</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Event Title</label>
                          <input
                            type="text"
                            value={gbpEventTitle}
                            onChange={(e) => setGbpEventTitle(e.target.value)}
                            placeholder="e.g. Weekend Artisan Tasting"
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={gbpStartDate}
                            onChange={(e) => setGbpStartDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">End Date</label>
                          <input
                            type="date"
                            value={gbpEndDate}
                            onChange={(e) => setGbpEndDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OFFER specific fields */}
                  {gbpTopicType === "OFFER" && (
                    <div className="p-3 rounded-md bg-slate-950/60 border border-slate-800 space-y-2">
                      <span className="text-[11px] font-semibold text-amber-300">Offer Details</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Coupon Code (optional)</label>
                          <input
                            type="text"
                            value={gbpCouponCode}
                            onChange={(e) => setGbpCouponCode(e.target.value)}
                            placeholder="e.g. TASTE20"
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Redeem Online URL</label>
                          <input
                            type="url"
                            value={gbpRedeemUrl}
                            onChange={(e) => setGbpRedeemUrl(e.target.value)}
                            placeholder="https://yourbusiness.com/redeem"
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Terms &amp; Conditions</label>
                          <input
                            type="text"
                            value={gbpTerms}
                            onChange={(e) => setGbpTerms(e.target.value)}
                            placeholder="e.g. One per customer. Valid this weekend."
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ALERT specific fields */}
                  {gbpTopicType === "ALERT" && (
                    <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                      <label className="block text-[10px] font-medium text-amber-300">Alert Type</label>
                      <select
                        value={gbpAlertType}
                        onChange={(e) => setGbpAlertType(e.target.value)}
                        className="w-full sm:w-60 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="COVID_19">COVID-19 / Public Safety Advisory</option>
                      </select>
                      <p className="text-[10px] text-amber-200/80">
                        Alert posts are pinned prominently to your Google Business Profile to inform local customers.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Editor: a note to the owner, sent with the post */}
            {sendsForApproval && (
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <label htmlFor="approval-note" className="block text-xs font-medium text-slate-400">
                  Note to the owner (optional)
                </label>
                <textarea
                  id="approval-note"
                  rows={2}
                  maxLength={1000}
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  placeholder="e.g. Could this go out Friday morning? I used the new menu photo."
                  className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-500">
                  The owner approves it, rejects it, or sends it back with a comment. Nothing is published until they approve.
                </p>
              </div>
            )}

            {/* Bottom Editor Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {!revisingPost && (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={loading || publishing}
                    className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Saving…" : "Save as Draft"}
                  </button>
                )}
                {sendsForApproval && (
                  <button
                    type="button"
                    onClick={handleSubmitForApproval}
                    disabled={loading || submitting}
                    className="px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Sending…" : revisingPost ? "Resubmit for Approval" : "Submit for Approval"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </fieldset>

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

                  {/* ALERT header if ALERT */}
                  {gbpTopicType === "ALERT" && (
                    <div className="p-2 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-semibold flex items-center gap-2">
                      <span>⚠️ COVID-19 / Public Safety Advisory</span>
                    </div>
                  )}

                  {/* EVENT header if EVENT */}
                  {gbpTopicType === "EVENT" && (
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-xs font-bold text-white">
                        📅 {gbpEventTitle || "Local Business Event"}
                      </div>
                      {(gbpStartDate || gbpEndDate) && (
                        <div className="text-[10px] text-amber-300 font-medium">
                          {gbpStartDate && `Starts: ${gbpStartDate}`} {gbpEndDate && `· Ends: ${gbpEndDate}`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* OFFER banner if OFFER */}
                  {gbpTopicType === "OFFER" && (
                    <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-amber-300">Special Promotion</div>
                        {gbpCouponCode && (
                          <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                            Promo Code: <strong className="text-white">{gbpCouponCode}</strong>
                          </div>
                        )}
                      </div>
                      {gbpRedeemUrl && (
                        <span className="text-[10px] text-blue-400 font-medium underline">
                          Redeem online
                        </span>
                      )}
                    </div>
                  )}

                  {activeMediaUrl && !isVideoUrl(activeMediaUrl) && (
                    <div className="rounded-md overflow-hidden border border-slate-800 max-h-52 bg-slate-900">
                      <img src={activeMediaUrl} alt="GBP Local Post photo" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {body || "Your Google Business Profile local update, offer, or announcement..."}
                  </p>

                  {gbpTopicType === "OFFER" && gbpTerms && (
                    <p className="text-[10px] text-slate-500 italic">
                      *{gbpTerms}
                    </p>
                  )}

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
              {drafts.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No drafts yet. Drafts saved by anyone on the team show up here.
                </p>
              )}
              {drafts.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setRevisingPost(null);
                    setActiveDraft(d);
                  }}
                  className={`p-3 rounded-md border text-xs cursor-pointer transition flex items-center justify-between ${
                    activeDraft?.id === d.id
                      ? "bg-indigo-950/40 border-indigo-500/50 text-white"
                      : "bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{d.content?.title || "Untitled post"}</span>
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
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      {d.authorName && <span className="text-slate-400">{d.authorName} · </span>}
                      {d.content?.body}
                    </div>
                  </div>
                  {(canDeleteAny || (canWrite && d.authorId === user.id)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDraft(d.id);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Delete Draft"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
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
            {canPublish && approvedCount > 0 && (
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
            { id: "pending_approval", label: `Needs approval${pendingCount ? ` (${pendingCount})` : ""}` },
            { id: "changes_requested", label: "Changes requested" },
            { id: "rejected", label: "Rejected" },
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
                            {post.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          <span className="text-slate-500">{accountName(post)} · </span>
                          {post.content?.body}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {sendsForApproval && REVISABLE.includes(post.status) && (
                        <button
                          type="button"
                          onClick={() => handleRevise(post)}
                          className="px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-200 font-semibold transition"
                        >
                          {post.status === "draft" ? "Edit & Submit" : "Revise"}
                        </button>
                      )}
                      {(post.status === "approved" || post.status === "failed") && canPublish && (
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
                      <button
                        type="button"
                        onClick={() => handleToggleHistory(post.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold transition"
                      >
                        {historyByPost[post.id] ? "Hide History" : "History"}
                      </button>
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

                  {post.lastApprovalEvent?.comment && (
                    <div className="p-2 rounded bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300">
                      <span className="font-semibold text-slate-200">{post.lastApprovalEvent.actorName}</span>
                      <span className="text-slate-500"> · {APPROVAL_STEP_WORDS[post.lastApprovalEvent.action]}: </span>
                      &ldquo;{post.lastApprovalEvent.comment}&rdquo;
                    </div>
                  )}

                  {historyByPost[post.id] && (
                    <ol className="p-2.5 rounded bg-slate-900/70 border border-slate-800 space-y-1.5 text-[11px]">
                      {historyByPost[post.id].length === 0 ? (
                        <li className="text-slate-500">No approval steps yet.</li>
                      ) : (
                        historyByPost[post.id].map((event) => (
                          <li key={event.id} className="text-slate-300">
                            <span className="text-slate-500">{new Date(event.timestamp).toLocaleString()} · </span>
                            <span className="font-semibold text-slate-200">{event.actorName}</span>{" "}
                            {HISTORY_WORDS[event.action] || event.action}
                            {event.comment && <>: &ldquo;{event.comment}&rdquo;</>}
                          </li>
                        ))
                      )}
                    </ol>
                  )}

                  {canReview && post.status === "pending_approval" && (
                    <div className="p-2.5 rounded bg-amber-500/5 border border-amber-500/20 space-y-2">
                      {post.aiMetadata?.guardrails && !post.aiMetadata.guardrails.passed && (
                        <p className="text-[11px] text-rose-300">
                          ⚠️ {post.aiMetadata.guardrails.violations?.length || 1} brand guardrail issue(s) flagged
                        </p>
                      )}
                      <textarea
                        rows={2}
                        maxLength={1000}
                        aria-label="Comment for the editor"
                        value={reviewComments[post.id] || ""}
                        onChange={(e) => setReviewComments((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        placeholder="Comment for the editor (needed to request changes)"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReview(post, "approve")}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(post, "request_changes")}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-200 font-semibold transition disabled:opacity-60"
                        >
                          Request changes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(post, "reject")}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 font-semibold transition disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

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

      {/* Setup Walkthrough Modal (#08, F27) */}
      <SetupWalkthroughModal
        isOpen={isWalkthroughOpen}
        initialStep={5}
        onClose={() => setIsWalkthroughOpen(false)}
      />
    </div>
  );
}
