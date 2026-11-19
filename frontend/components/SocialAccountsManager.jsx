"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { loadFacebookSdk } from "../lib/facebookSdk";
import { SetupWalkthroughModal } from "./SetupWalkthroughModal";
import { SignInPrompt } from "./SignInPrompt";
import { can } from "../lib/roles";
import {
  InstagramIcon,
  FacebookIcon,
  TwitterIcon,
  LinkedInIcon,
  GoogleIcon,
  PlusIcon,
  CheckIcon,
} from "./Icons";

const META_ERROR_MESSAGES = {
  no_facebook_page_found:
    "No Facebook Page was found for that account. You need to manage at least one Page, and it must belong to a Business Portfolio.",
  oauth_failed: "Something went wrong completing the Meta login.",
};

const BLOCKER_SHORT_LABELS = {
  no_facebook_page: "No Facebook Page",
  missing_page_permissions: "Page Role Needed",
  non_professional_ig: "Personal IG Account",
  unlinked_ig: "Link IG to Page",
  no_gbp_listing: "No GBP Listing",
  unverified_gbp: "GBP Verification Needed",
};

const AVAILABLE_CHANNELS = [
  {
    platform: "instagram",
    name: "Instagram Business",
    icon: InstagramIcon,
    color: "text-pink-400 border-pink-500/30 bg-pink-500/10",
    description: "Publish photo carousels, reels, and stories with automated hashtags.",
  },
  {
    platform: "facebook",
    name: "Facebook Global Page",
    icon: FacebookIcon,
    color: "text-blue-500 border-blue-600/30 bg-blue-600/10",
    description: "Publish community updates, media assets, and engage your fan base.",
  },
  {
    platform: "twitter",
    name: "Twitter / X Account",
    icon: TwitterIcon,
    color: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    description: "Publish real-time announcements, short-form insights, and campaign updates.",
  },
  {
    platform: "linkedin",
    name: "LinkedIn Organization / Profile",
    icon: LinkedInIcon,
    color: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    description: "Publish industry thought leadership, company news, and professional articles.",
  },
  {
    platform: "gbp",
    name: "Google Business Profile (#13)",
    icon: GoogleIcon,
    color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    description: "Publish GBP Local Posts with call-to-action buttons, offers, and local search visibility.",
  },
];

export function SocialAccountsManager() {
  const { authReady, token, user, currentWorkspace, setAuthModalOpen, socialAccounts, setSocialAccounts, addToast } =
    useAppStore();
  // Connecting accounts decides where posts go, so only the owner can (F10).
  const manages = can(currentWorkspace, "accounts.manage");
  const viewerRole = currentWorkspace?.role || "viewer";
  const canViewWalkthrough = manages || viewerRole === "editor";

  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false);
  const [walkthroughPlatform, setWalkthroughPlatform] = useState("facebook");
  const [activeBlocker, setActiveBlocker] = useState(null);
  const [progressByPlatform, setProgressByPlatform] = useState({});
  const [selectedChannel, setSelectedChannel] = useState("instagram");
  const [accountHandle, setAccountHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [metaConnecting, setMetaConnecting] = useState(false);
  // Pages the logged-in Facebook account can grant access to, shown as a
  // picker when there's more than one — connecting silently picks the first
  // otherwise, which is wrong for anyone managing multiple Pages.
  const [metaAccessToken, setMetaAccessToken] = useState(null);
  const [metaPages, setMetaPages] = useState([]);
  const [connectingPageId, setConnectingPageId] = useState(null);

  const activeWorkspaceId = currentWorkspace?.id || currentWorkspace?._id;

  useEffect(() => {
    // Wait for auth to be resolved so this doesn't fire before a restored
    // token is in place and 401 silently, leaving the page stuck on "Inactive".
    if (authReady && user) {
      loadAccounts();
      loadSetupProgress();
    }
  }, [authReady, token, user, activeWorkspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const platParam = params.get("platform");
    if (params.get("walkthrough") === "1" && canViewWalkthrough) {
      if (platParam) setWalkthroughPlatform(platParam);
      setIsWalkthroughOpen(true);
    } else if (params.get("connect") === "1" && manages) {
      if (platParam) setSelectedChannel(platParam);
      setIsConnectModalOpen(true);
    }
  }, [manages, canViewWalkthrough]);

  function openWalkthroughFor(platform = "facebook", blockerReason = null) {
    setWalkthroughPlatform(platform);
    setActiveBlocker(blockerReason ? { platform, blockerReason } : null);
    setIsWalkthroughOpen(true);
  }

  function handleProgressUpdated(platform, updatedProgress) {
    setProgressByPlatform((prev) => ({
      ...prev,
      [platform]: updatedProgress,
    }));
  }

  async function loadSetupProgress() {
    try {
      const data = await api.channelSetup.getProgress();
      if (Array.isArray(data?.items)) {
        const map = {};
        for (const item of data.items) {
          map[item.platform] = item;
        }
        setProgressByPlatform(map);
      }
    } catch (_err) {
      // ignore
    }
  }

  async function handleConnectWithMeta(targetPlat = selectedChannel) {
    // Channels belong to a business profile, so never start Meta's login signed out.
    if (!user) return setAuthModalOpen(true);

    const configId = process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID;
    if (!process.env.NEXT_PUBLIC_META_APP_ID || !configId) {
      return addToast("error", "Meta OAuth isn't configured on this server — use the sandbox form below instead.");
    }

    setMetaConnecting(true);
    try {
      const FB = await loadFacebookSdk();
      FB.login(
        (response) => {
          if (response.authResponse?.accessToken) {
            handleMetaLoginResponse(response.authResponse.accessToken, targetPlat);
          } else {
            addToast("info", "Facebook login was cancelled.");
            setMetaConnecting(false);
          }
        },
        { config_id: configId }
      );
    } catch (err) {
      addToast("error", err.message || "Could not load Facebook Login");
      setMetaConnecting(false);
    }
  }

  async function handleMetaLoginResponse(accessToken, targetPlat = selectedChannel) {
    try {
      const res = await api.auth.listMetaPages(accessToken);
      const pages = res.pages || [];

      // When no Page or professional account is found, hand off to the setup walkthrough (#08, F27)
      if (pages.length === 0 || res.handoff === "setup_walkthrough") {
        if (res.progress) {
          handleProgressUpdated("facebook", res.progress);
        }
        setIsConnectModalOpen(false);
        openWalkthroughFor("facebook", res.blockerReason || "no_facebook_page");
        addToast("info", "No Facebook Page found. Opening Setup Walkthrough (#08, F27)...");
        return;
      }

      if (pages.length === 1) {
        await connectMetaPage(accessToken, pages[0].id, targetPlat);
        return;
      }
      // Multiple Pages — let the person pick instead of guessing.
      setMetaAccessToken(accessToken);
      setMetaPages(pages);
    } catch (err) {
      const reason = err.response?.data?.error;
      const blocker = err.response?.data?.blockerReason || "no_facebook_page";
      if (reason === "no_facebook_page_found" || err.response?.data?.handoff === "setup_walkthrough") {
        setIsConnectModalOpen(false);
        openWalkthroughFor("facebook", blocker);
      }
      addToast("error", META_ERROR_MESSAGES[reason] || "Could not list your Facebook Pages");
    } finally {
      setMetaConnecting(false);
    }
  }

  async function connectMetaPage(accessToken, pageId, targetPlat = selectedChannel) {
    setConnectingPageId(pageId);
    try {
      const res = await api.auth.connectMetaPage(accessToken, pageId, targetPlat);
      const connected = res.connected || [];
      addToast("success", `Connected via Meta: ${connected.join(", ")}`);
      setIsConnectModalOpen(false);
      setMetaAccessToken(null);
      setMetaPages([]);
      await Promise.all([loadAccounts(), loadSetupProgress()]);

      // If Facebook connected but Instagram wasn't linked/professional, guide the user through the IG walkthrough
      if (res.instagramBlocker && (targetPlat === "instagram" || res.handoff === "setup_walkthrough")) {
        openWalkthroughFor("instagram", res.instagramBlocker);
        addToast(
          "info",
          "Facebook Page connected! Follow the Instagram walkthrough to link your Professional Instagram account."
        );
      }
    } catch (err) {
      const reason = err.response?.data?.error;
      const blocker = err.response?.data?.blockerReason || "missing_page_permissions";
      if (reason === "no_facebook_page_found" || err.response?.data?.handoff === "setup_walkthrough") {
        setIsConnectModalOpen(false);
        openWalkthroughFor("facebook", blocker);
      }
      addToast("error", META_ERROR_MESSAGES[reason] || "Could not complete Meta connection");
    } finally {
      setConnectingPageId(null);
    }
  }

  async function loadAccounts() {
    try {
      const items = await api.socialAccounts.list();
      setSocialAccounts(items);
    } catch (_err) {
      // ignore
    }
  }

  async function handleConnect(e) {
    e.preventDefault();
    if (!accountHandle.trim()) return addToast("error", "Please provide account handle or page name");

    setLoading(true);
    try {
      const created = await api.socialAccounts.link({
        platform: selectedChannel,
        handle: accountHandle,
        displayName: displayName || `${accountHandle} (${selectedChannel.toUpperCase()})`,
      });

      setSocialAccounts([...socialAccounts, created]);
      await loadSetupProgress();
      addToast("success", `Connected ${selectedChannel} account successfully!`);
      setIsConnectModalOpen(false);
      setAccountHandle("");
      setDisplayName("");
    } catch (err) {
      addToast("error", err.message || "Failed to link channel");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(id, name) {
    try {
      await api.socialAccounts.unlink(id);
      setSocialAccounts(socialAccounts.filter((a) => a.id !== id));
      await loadSetupProgress();
      addToast("info", `Disconnected ${name}`);
    } catch (_err) {
      addToast("error", "Failed to disconnect channel");
    }
  }

  if (!authReady) {
    return <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading channels...</div>;
  }

  if (!user) {
    return (
      <SignInPrompt title="Sign in to connect your channels">
        Your Facebook and Instagram accounts are linked to a business profile, so you need to be signed in first.
      </SignInPrompt>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Connected Social Channels</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {manages
              ? "Manage your authenticated social platforms, token permissions, and publishing routes."
              : "The accounts this business posts to. Only the business owner can connect or disconnect them."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canViewWalkthrough && (
            <button
              type="button"
              onClick={() => openWalkthroughFor("facebook")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              <span>Setup Walkthrough (#08)</span>
            </button>
          )}
          {manages && (
            <button
              type="button"
              onClick={() => setIsConnectModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Connect New Channel</span>
            </button>
          )}
        </div>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {AVAILABLE_CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const connectedAccounts = socialAccounts.filter(
            (a) => a.platform === ch.platform || (ch.platform === "gbp" && a.platform === "google_business")
          );
          const platProgress = progressByPlatform[ch.platform];
          const isWaitingOnPlatform = platProgress?.status === "waiting_on_platform";
          const hasBlocker = Boolean(platProgress?.blockerReason) && connectedAccounts.length === 0;
          const isInProgress =
            platProgress?.status === "in_progress" && connectedAccounts.length === 0 && !isWaitingOnPlatform;

          return (
            <div
              key={ch.platform}
              className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`p-2.5 rounded-md border ${ch.color}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white">{ch.name}</h3>
                      <p className="text-[11px] text-slate-400">{ch.description}</p>
                    </div>
                  </div>

                  {connectedAccounts.length > 0 ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold shrink-0">
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>{connectedAccounts.length} Connected</span>
                    </span>
                  ) : isWaitingOnPlatform ? (
                    <span className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold shrink-0">
                      ⏳ Waiting on Google
                    </span>
                  ) : hasBlocker ? (
                    <span className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-semibold shrink-0">
                      ⚠️ {BLOCKER_SHORT_LABELS[platProgress.blockerReason] || "Setup Needed"}
                    </span>
                  ) : isInProgress ? (
                    <span className="px-2.5 py-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold shrink-0">
                      Step {platProgress.currentStep} in progress
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 text-[11px] font-semibold shrink-0">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Saved Walkthrough Progress Callout when not connected */}
                {connectedAccounts.length === 0 && (isWaitingOnPlatform || hasBlocker || isInProgress) && (
                  <div
                    className={`p-3 rounded-md border text-xs flex items-center justify-between gap-2 ${
                      isWaitingOnPlatform
                        ? "bg-amber-500/10 border-amber-500/25 text-amber-200"
                        : hasBlocker
                        ? "bg-rose-500/10 border-rose-500/25 text-rose-200"
                        : "bg-slate-950 border-slate-800 text-slate-300"
                    }`}
                  >
                    <span className="text-[11px] leading-snug">
                      {isWaitingOnPlatform
                        ? `Saved at Step ${platProgress.currentStep} — awaiting Google verification review (3–5 business days).`
                        : hasBlocker
                        ? `Blocker detected at Step ${platProgress.currentStep}: ${
                            BLOCKER_SHORT_LABELS[platProgress.blockerReason] || platProgress.blockerReason
                          }.`
                        : `Walkthrough saved at Step ${platProgress.currentStep}.`}
                    </span>
                    {canViewWalkthrough && (
                      <button
                        type="button"
                        onClick={() => openWalkthroughFor(ch.platform, platProgress?.blockerReason)}
                        className="text-[11px] font-bold underline underline-offset-2 shrink-0 hover:text-white"
                      >
                        Resume →
                      </button>
                    )}
                  </div>
                )}

                {connectedAccounts.length > 0 && (
                  <div className="space-y-2">
                    {connectedAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-3.5 rounded-md bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="font-semibold text-white truncate max-w-[70%]">
                            {account.displayName}
                          </span>
                          {manages && (
                            <button
                              onClick={() => handleDisconnect(account.id, account.displayName)}
                              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition shrink-0"
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="text-slate-500 font-medium">Status:</span>
                          <span className="text-emerald-400 font-medium">
                            {account.isLive ? "Connected · Live" : "Demo Account · Sandbox"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">
                    {connectedAccounts.length > 0
                      ? "Ready for automated publish"
                      : isWaitingOnPlatform
                      ? "Awaiting platform review"
                      : "Not linked yet"}
                  </span>
                  {canViewWalkthrough && connectedAccounts.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openWalkthroughFor(ch.platform, platProgress?.blockerReason)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Setup Guide
                    </button>
                  )}
                </div>
                {manages && (
                  <button
                    onClick={() => {
                      setSelectedChannel(ch.platform);
                      setIsConnectModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition"
                  >
                    {connectedAccounts.length > 0 ? "Connect Another" : "Connect Channel"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Channel Modal */}
      {manages && isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
          <div className="relative w-full max-w-md p-6 rounded-lg bg-slate-900 border border-slate-800">
            <button
              onClick={() => {
                setIsConnectModalOpen(false);
                setMetaAccessToken(null);
                setMetaPages([]);
              }}
              aria-label="Close connect channel modal"
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            {metaPages.length > 0 ? (
              <>
                <h3 className="text-base font-bold text-white mb-1">Choose a Facebook Page</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Your Facebook account manages {metaPages.length} Pages — pick the one to connect
                  (and its linked Instagram account, if any).
                </p>

                <div className="space-y-2">
                  {metaPages.map((page) => {
                    const alreadyConnected = socialAccounts.some(
                      (a) => a.platform === "facebook" && a.externalAccountId === page.id
                    );
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => connectMetaPage(metaAccessToken, page.id, selectedChannel)}
                        disabled={connectingPageId !== null}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-md bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-left transition disabled:opacity-60"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white flex items-center gap-2">
                            {page.name}
                            {alreadyConnected && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                                <CheckIcon className="w-3 h-3" />
                                Connected
                              </span>
                            )}
                          </div>
                          {page.category && (
                            <div className="text-[11px] text-slate-500">{page.category}</div>
                          )}
                        </div>
                        <span className="text-xs text-indigo-400 font-semibold shrink-0">
                          {connectingPageId === page.id
                            ? "Connecting..."
                            : alreadyConnected
                            ? "Refresh token"
                            : "Connect"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMetaAccessToken(null);
                    setMetaPages([]);
                  }}
                  className="mt-4 text-xs text-slate-500 hover:text-slate-300"
                >
                  ← Back
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-white mb-1">Connect Social Channel</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Authorize publishing access for multi-platform scheduling.
                </p>

                {selectedChannel === "gbp" ? (
                  <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                    <div className="font-semibold">
                      Google Business Profile requires a verified listing
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Don&apos;t have a verified Google listing yet? Follow our step-by-step walkthrough
                      (video verification typically takes 3–5 business days).
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsConnectModalOpen(false);
                        openWalkthroughFor("gbp", "unverified_gbp");
                      }}
                      className="w-full py-2 px-3 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold transition"
                    >
                      Open GBP Verification Walkthrough (#08)
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnectWithMeta(selectedChannel)}
                    disabled={metaConnecting}
                    className="w-full mb-4 py-2.5 px-4 rounded-md bg-[#1877F2] hover:bg-[#1567d6] text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60"
                  >
                    <FacebookIcon className="w-4 h-4" />
                    <span>
                      {metaConnecting ? "Waiting for Facebook..." : "Connect with Facebook (Meta OAuth)"}
                    </span>
                  </button>
                )}

                <div className="flex items-center my-3 text-slate-600 text-xs">
                  <div className="flex-1 border-t border-slate-800" />
                  <span className="px-3">or use sandbox mode</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>

                <p className="text-[11px] text-slate-500 mb-3">
                  No live platform token configured? Link a demo account by name — it simulates publishing and collects metrics in the job queue.
                </p>

                <form onSubmit={handleConnect} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Platform</label>
                    <select
                      value={selectedChannel}
                      onChange={(e) => setSelectedChannel(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="instagram">Instagram Business</option>
                      <option value="facebook">Facebook Page</option>
                      <option value="twitter">Twitter / X</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="gbp">Google Business Profile (GBP Local Posts #13)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Account Handle or Page ID
                    </label>
                    <input
                      type="text"
                      required
                      value={accountHandle}
                      onChange={(e) => setAccountHandle(e.target.value)}
                      placeholder="@company_official or page_109238"
                      className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Display Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Brand Main Page"
                      className="w-full px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
                  >
                    {loading ? "Authorizing..." : "Link Channel"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Setup Walkthrough Modal (#08, F27) */}
      <SetupWalkthroughModal
        isOpen={isWalkthroughOpen}
        onClose={() => setIsWalkthroughOpen(false)}
        initialPlatform={walkthroughPlatform}
        activeBlocker={activeBlocker}
        progressByPlatform={progressByPlatform}
        onProgressUpdated={handleProgressUpdated}
        canManage={manages}
        viewerRole={viewerRole}
        onRetryConnect={(plat) => {
          setIsWalkthroughOpen(false);
          if (plat) setSelectedChannel(plat);
          handleConnectWithMeta(plat || selectedChannel);
        }}
        onUseSandbox={(plat) => {
          setIsWalkthroughOpen(false);
          if (plat) setSelectedChannel(plat);
          setIsConnectModalOpen(true);
        }}
      />
    </div>
  );
}
