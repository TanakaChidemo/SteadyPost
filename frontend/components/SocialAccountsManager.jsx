"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { loadFacebookSdk } from "../lib/facebookSdk";
import {
  InstagramIcon,
  FacebookIcon,
  PlusIcon,
  CheckIcon,
} from "./Icons";

const META_ERROR_MESSAGES = {
  no_facebook_page_found: "No Facebook Page was found for that account. You need to manage at least one Page, and it must belong to a Business Portfolio.",
  oauth_failed: "Something went wrong completing the Meta login.",
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
];

export function SocialAccountsManager() {
  const { authReady, token, socialAccounts, setSocialAccounts, addToast } = useAppStore();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
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

  useEffect(() => {
    // Wait for auth to be resolved so this doesn't fire before a restored
    // token is in place and 401 silently, leaving the page stuck on "Inactive".
    if (authReady) loadAccounts();
  }, [authReady, token]);

  async function handleConnectWithMeta() {
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
            handleMetaLoginResponse(response.authResponse.accessToken);
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

  async function handleMetaLoginResponse(accessToken) {
    try {
      const { pages } = await api.auth.listMetaPages(accessToken);
      if (pages.length === 0) {
        addToast("error", META_ERROR_MESSAGES.no_facebook_page_found);
        return;
      }
      if (pages.length === 1) {
        await connectMetaPage(accessToken, pages[0].id);
        return;
      }
      // Multiple Pages — let the person pick instead of guessing.
      setMetaAccessToken(accessToken);
      setMetaPages(pages);
    } catch (err) {
      const reason = err.response?.data?.error;
      addToast("error", META_ERROR_MESSAGES[reason] || "Could not list your Facebook Pages");
    } finally {
      setMetaConnecting(false);
    }
  }

  async function connectMetaPage(accessToken, pageId) {
    setConnectingPageId(pageId);
    try {
      const { connected } = await api.auth.connectMetaPage(accessToken, pageId);
      addToast("success", `Connected via Meta: ${connected.join(", ")}`);
      setIsConnectModalOpen(false);
      setMetaAccessToken(null);
      setMetaPages([]);
      loadAccounts();
    } catch (err) {
      const reason = err.response?.data?.error;
      addToast("error", META_ERROR_MESSAGES[reason] || "Could not complete Meta connection");
    } finally {
      setConnectingPageId(null);
    }
  }

  async function loadAccounts() {
    try {
      const items = await api.socialAccounts.list();
      setSocialAccounts(items);
    } catch (err) {
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
      addToast("info", `Disconnected ${name}`);
    } catch (err) {
      addToast("error", "Failed to disconnect channel");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Connected Social Channels</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your authenticated social platforms, token permissions, and publishing routes.
          </p>
        </div>

        <button
          onClick={() => setIsConnectModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md gradient-brand text-white text-xs font-semibold hover:opacity-95 transition"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Connect New Channel</span>
        </button>
      </div>

      {/* Channel Cards Grid — one section per platform, listing every
          connected account (a user can manage more than one Facebook Page) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {AVAILABLE_CHANNELS.map((ch) => {
          const Icon = ch.icon;
          const connectedAccounts = socialAccounts.filter((a) => a.platform === ch.platform);

          return (
            <div
              key={ch.platform}
              className="p-5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
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
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>
                        {connectedAccounts.length} Connected
                      </span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 text-[11px] font-semibold">
                      Inactive
                    </span>
                  )}
                </div>

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
                          <button
                            onClick={() => handleDisconnect(account.id, account.displayName)}
                            className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition shrink-0"
                          >
                            Disconnect
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="text-slate-500 font-medium">Status:</span>
                          <span className="text-emerald-400 font-medium">
                            {account.isLive ? "Connected via Meta · Live" : "Demo Account · Sandbox"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {connectedAccounts.length > 0 ? "Ready for automated publish" : "Not linked yet"}
                </span>
                <button
                  onClick={() => {
                    setSelectedChannel(ch.platform);
                    setIsConnectModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition"
                >
                  {connectedAccounts.length > 0 ? "Connect Another" : "Connect Channel"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Channel Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
          <div className="relative w-full max-w-md p-6 rounded-lg bg-slate-900 border border-slate-800">
            <button
              onClick={() => {
                setIsConnectModalOpen(false);
                setMetaAccessToken(null);
                setMetaPages([]);
              }}
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
                        onClick={() => connectMetaPage(metaAccessToken, page.id)}
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

                <button
                  type="button"
                  onClick={handleConnectWithMeta}
                  disabled={metaConnecting}
                  className="w-full mb-4 py-2.5 px-4 rounded-md bg-[#1877F2] hover:bg-[#1567d6] text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60"
                >
                  <FacebookIcon className="w-4 h-4" />
                  <span>{metaConnecting ? "Waiting for Facebook..." : "Connect with Facebook (Meta OAuth)"}</span>
                </button>

                <div className="flex items-center my-3 text-slate-600 text-xs">
                  <div className="flex-1 border-t border-slate-800" />
                  <span className="px-3">or use sandbox mode</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>

                <p className="text-[11px] text-slate-500 mb-3">
                  No real Meta app configured on this server? Link a demo account by name instead — it
                  won't be able to publish to the real Graph API.
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
                  className="w-full px-3.5 py-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
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
    </div>
  );
}
