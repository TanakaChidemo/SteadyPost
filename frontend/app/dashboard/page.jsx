"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "../../lib/store";
import { api } from "../../lib/apiClient";
import {
  SparklesIcon,
  InstagramIcon,
  FacebookIcon,
  LayersIcon,
  PlusIcon,
  ArrowUpRightIcon,
  SendIcon,
  UsersIcon,
  BarChartIcon,
} from "../../components/Icons";
import { PageHeader, StatCard, Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button, IconButton } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/EmptyState";
import { CardGridSkeleton } from "../../components/ui/Skeleton";
import { cn } from "../../lib/cn";

const PLATFORM_TOGGLE = [
  { id: "instagram", Icon: InstagramIcon, label: "Instagram" },
  { id: "facebook", Icon: FacebookIcon, label: "Facebook" },
];

export default function DashboardOverviewPage() {
  const {
    user,
    authReady,
    token,
    drafts,
    setDrafts,
    socialAccounts,
    addToast,
    setAiModalOpen,
  } = useAppStore();

  const [quickPost, setQuickPost] = useState("");
  const [quickPlatform, setQuickPlatform] = useState("instagram");
  const [isPublishing, setIsPublishing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to be resolved (token restored from localStorage) so this
    // doesn't fire before login and silently 401, leaving stats stuck at 0.
    if (authReady) loadData();
  }, [authReady, token]);

  async function loadData() {
    setStatsLoading(true);
    try {
      const draftItems = await api.content.list();
      setDrafts(draftItems);
    } catch (err) {
      // fallback: keep store values
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleQuickPublish() {
    if (!quickPost.trim()) return addToast("error", "Write some text to publish");
    setIsPublishing(true);
    try {
      const draft = await api.content.create({
        title: `Quick Post (${quickPlatform})`,
        body: quickPost,
        platforms: [quickPlatform],
      });
      const { postId } = await api.publish.now({
        contentDraftId: draft._id,
        platform: quickPlatform,
      });
      const result = await api.publish.waitForResult(postId);
      if (result.status === "published") {
        addToast("success", `Published to ${quickPlatform}!`);
        setQuickPost("");
      } else {
        addToast("error", `Failed to publish to ${quickPlatform}: ${result.errorMessage || "Publishing did not complete"}`);
      }
      loadData();
    } catch (err) {
      addToast("error", err.message || "Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  }

  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={firstName ? `Welcome back, ${firstName}` : "Welcome to SteadyPost"}
        description="Here is what is happening across your social channels today."
        actions={
          <>
            <Button variant="ai" size="sm" onClick={() => setAiModalOpen(true)}>
              <SparklesIcon className="w-4 h-4" aria-hidden="true" />
              AI Copywriter
            </Button>
            <Link href="/dashboard/content">
              <Button size="sm">
                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                New Campaign
              </Button>
            </Link>
          </>
        }
      />

      {statsLoading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <StatCard
            label="Drafts in studio"
            value={drafts.length}
            hint="Ready for editing and review"
            icon={<LayersIcon className="w-5 h-5" aria-hidden="true" />}
          />
          <StatCard
            label="Channels connected"
            value={`${socialAccounts.length} / 2`}
            hint="Instagram · Facebook"
            icon={<UsersIcon className="w-5 h-5" aria-hidden="true" />}
            iconTone="bg-info-bg text-info"
            trend={
              socialAccounts.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-bg border border-success/25 font-mono text-micro uppercase tracking-[0.04em] text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
                  Synced
                </span>
              ) : (
                <Link href="/dashboard/accounts" className="text-caption font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                  Connect
                </Link>
              )
            }
          />
          <StatCard
            label="Total audience reach"
            value="24,850"
            hint="Across connected networks"
            icon={<BarChartIcon className="w-5 h-5" aria-hidden="true" />}
            iconTone="bg-accent-bg text-accent"
            trend={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-bg border border-success/25 font-mono text-micro uppercase tracking-[0.04em] text-success">
                +18.4% <ArrowUpRightIcon className="w-3 h-3" aria-hidden="true" />
              </span>
            }
          />
        </div>
      )}

      {/* Quick Composer */}
      <Card>
        <CardHeader
          eyebrow="Compose"
          title="Quick Composer"
          subtitle="Draft and publish a short update without opening the full studio."
          action={
            <div className="flex items-center gap-1.5" role="group" aria-label="Publish platform">
              {PLATFORM_TOGGLE.map(({ id, Icon, label }) => (
                <IconButton
                  key={id}
                  label={label}
                  aria-pressed={quickPlatform === id}
                  onClick={() => setQuickPlatform(id)}
                  className={cn(
                    quickPlatform === id && "border-brand-500/50 bg-brand-50 text-brand-700"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </IconButton>
              ))}
            </div>
          }
        />
        <CardBody className="space-y-4">
          <Field hint={`${quickPost.length} characters`}>
            <Textarea
              rows={4}
              value={quickPost}
              onChange={(e) => setQuickPost(e.target.value)}
              placeholder={`Draft a quick update for ${quickPlatform}… (or open the AI Copywriter for assistance)`}
              aria-label="Quick post text"
            />
          </Field>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <Link
              href="/dashboard/content"
              className="text-body-sm text-brand-600 hover:text-brand-700 hover:underline font-semibold"
            >
              Open Full Studio with Live Preview →
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAiModalOpen(true)}>
                <SparklesIcon className="w-3.5 h-3.5" aria-hidden="true" />
                AI
              </Button>
              <Button size="sm" onClick={handleQuickPublish} disabled={isPublishing} loading={isPublishing}>
                {!isPublishing && <SendIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                {isPublishing ? "Publishing…" : "Publish Now"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* First-run nudge */}
      {!statsLoading && socialAccounts.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          eyebrow="Get started"
          title="Connect your first channel"
          description="Link Instagram or Facebook to publish from SteadyPost. It takes about a minute."
          action={
            <Link href="/dashboard/accounts">
              <Button size="sm">Connect a channel</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
