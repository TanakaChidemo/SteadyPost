"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../../lib/store";
import { api } from "../../lib/apiClient";
import { AIModal } from "../AIModal";
import { StudioHeader } from "./StudioHeader";
import { DestinationPicker } from "./DestinationPicker";
import { PostEditor } from "./PostEditor";
import { FeedPreviewPanel } from "./FeedPreviewPanel";
import { DraftList } from "./DraftList";
import { MAX_MEDIA } from "./MediaUploader";
import { getFeedChannels } from "../feed";

const PLATFORM_CHAR_LIMITS = { instagram: 2200, facebook: 63206 };

/**
 * Content Studio orchestrator. Owns draft state, publishing flow and
 * preview selection; rendering is delegated to studio/* components.
 */
export function ContentStudio() {
  const {
    authReady,
    token,
    drafts,
    setDrafts,
    activeDraft,
    setActiveDraft,
    addToast,
    setAiModalOpen,
    socialAccounts,
  } = useAppStore();

  const [title, setTitle] = useState("New Social Campaign");
  const [body, setBody] = useState("");
  // Which connected accounts to publish to — not which platforms, since a
  // user can own more than one Page per platform.
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [mediaUrls, setMediaUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewChannel, setPreviewChannel] = useState("instagram");
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Publishing is async on the backend (submit -> poll per platform), so
  // this names the in-flight stage for the button label.
  const [publishStage, setPublishStage] = useState("");

  // Draft metadata stores platform *types*; derive them from selection.
  const selectedPlatforms = Array.from(
    new Set(
      selectedAccountIds
        .map((id) => socialAccounts.find((a) => a.id === id)?.platform)
        .filter(Boolean)
    )
  );

  // Channels available for preview = registered feed previews ∩ selected platforms.
  const previewChannels = getFeedChannels().filter((c) => selectedPlatforms.includes(c));

  // The account the preview labels itself with — prefer a selected account
  // for the previewed channel, otherwise any connected one.
  const previewAccount =
    socialAccounts.find((a) => a.platform === previewChannel && selectedAccountIds.includes(a.id)) ||
    socialAccounts.find((a) => a.platform === previewChannel) ||
    null;

  useEffect(() => {
    if (authReady) loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, token]);

  // Default to every connected account when starting a fresh post.
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
      // Old drafts only recorded platform types — best effort: select every
      // currently-connected account of those types.
      const platforms =
        activeDraft.platforms.length > 0 ? activeDraft.platforms : ["instagram", "facebook"];
      setSelectedAccountIds(
        socialAccounts.filter((a) => platforms.includes(a.platform)).map((a) => a.id)
      );
      setMediaUrls(activeDraft.mediaUrls || []);
      setPreviewMediaIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraft, socialAccounts]);

  // Keep the preview channel valid as selection changes.
  useEffect(() => {
    if (previewChannels.length > 0 && !previewChannels.includes(previewChannel)) {
      setPreviewChannel(previewChannels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountIds]);

  async function loadDrafts() {
    try {
      const items = await api.content.list();
      setDrafts(items);
      // Deliberately not auto-selecting a saved draft — the compose box
      // starts blank; drafts open explicitly from the list.
    } catch (err) {
      // fallback: leave whatever is in the store
    }
  }

  function toggleAccount(accountId) {
    const account = socialAccounts.find((a) => a.id === accountId);
    if (selectedAccountIds.includes(accountId)) {
      if (selectedAccountIds.length === 1)
        return addToast("info", "At least one account must be selected");
      const remainingIds = selectedAccountIds.filter((id) => id !== accountId);
      setSelectedAccountIds(remainingIds);
      if (account && previewChannel === account.platform) {
        const stillHasPlatform = remainingIds.some(
          (id) => socialAccounts.find((a) => a.id === id)?.platform === account.platform
        );
        if (!stillHasPlatform) {
          const remainingPlatform = socialAccounts.find((a) => remainingIds.includes(a.id))?.platform;
          if (remainingPlatform) setPreviewChannel(remainingPlatform);
        }
      }
    } else {
      setSelectedAccountIds([...selectedAccountIds, accountId]);
      if (account) setPreviewChannel(account.platform);
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

  async function handlePublishNow() {
    if (!body.trim()) return addToast("error", "Please write post content before publishing");
    if (selectedAccountIds.length === 0) {
      return addToast("error", "Connect a social account first — see the Channels page.");
    }

    setPublishing(true);
    setPublishStage("Submitting…");
    try {
      let draftId = activeDraft?._id;
      if (!draftId) {
        const created = await api.content.create({
          title,
          body,
          platforms: selectedPlatforms,
          mediaUrls,
        });
        draftId = created._id;
        setActiveDraft(created);
      }

      const submissions = [];
      for (const accountId of selectedAccountIds) {
        const account = socialAccounts.find((a) => a.id === accountId);
        if (!account) continue;
        const { postId } = await api.publish.now({
          contentDraftId: draftId,
          platform: account.platform,
          socialAccountId: account.id,
        });
        submissions.push({ account, postId });
      }

      setPublishStage("Publishing…");
      const results = await Promise.all(
        submissions.map(async (s) => ({ ...s, result: await api.publish.waitForResult(s.postId) }))
      );

      const succeeded = results
        .filter((r) => r.result.status === "published")
        .map((r) => r.account.displayName);
      const failed = results.filter((r) => r.result.status !== "published");

      if (succeeded.length > 0) {
        addToast("success", `Published to ${succeeded.join(", ")} successfully!`);
      }
      failed.forEach((f) => {
        addToast(
          "error",
          `Failed to publish to ${f.account.displayName}: ${f.result.errorMessage || "Publishing did not complete"}`
        );
      });
    } catch (err) {
      addToast("error", err.message || "Publishing failed");
    } finally {
      setPublishing(false);
      setPublishStage("");
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
      if (activeDraft?._id === id) handleCreateNew();
      loadDrafts();
    } catch (err) {
      addToast("error", "Could not delete draft");
    }
  }

  const charLimit = PLATFORM_CHAR_LIMITS[previewChannel];

  return (
    <div className="space-y-6">
      <StudioHeader
        onNewDraft={handleCreateNew}
        onAiAssist={() => setAiModalOpen(true)}
        onPublish={handlePublishNow}
        publishing={publishing}
        publishStage={publishStage}
        busy={loading || publishing}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-5">
          <DestinationPicker
            accounts={socialAccounts}
            selectedIds={selectedAccountIds}
            onToggle={toggleAccount}
          />
          <PostEditor
            title={title}
            onTitleChange={setTitle}
            body={body}
            onBodyChange={setBody}
            charLimit={charLimit}
            mediaProps={{
              mediaUrls,
              uploading,
              onFilesSelected: handleFilesSelected,
              onRemove: handleRemoveMedia,
            }}
            onSaveDraft={handleSaveDraft}
            saving={loading}
            publishing={publishing}
            onAiAssist={() => setAiModalOpen(true)}
          />
        </div>

        <div className="lg:col-span-5 space-y-5">
          <FeedPreviewPanel
            channels={previewChannels}
            activeChannel={previewChannel}
            onChannelChange={setPreviewChannel}
            accountName={previewAccount?.displayName}
            body={body}
            mediaUrls={mediaUrls}
            mediaIndex={previewMediaIndex}
            onMediaIndexChange={setPreviewMediaIndex}
          />
          <DraftList
            drafts={drafts}
            activeDraftId={activeDraft?._id}
            onSelect={setActiveDraft}
            onDelete={handleDeleteDraft}
          />
        </div>
      </div>

      <AIModal
        initialContent={body}
        onInsert={(text) => setBody((prev) => (prev ? `${prev}\n\n${text}` : text))}
      />
    </div>
  );
}
