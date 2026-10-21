"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { loadFacebookSdk } from "../lib/facebookSdk";
import { InstagramIcon, FacebookIcon, PlusIcon, CheckIcon } from "./Icons";
import { PageHeader, Card, CardBody } from "./ui/Card";
import { Button } from "./ui/Button";
import { Field, Input, Select } from "./ui/Field";
import { Modal, ModalHeader } from "./ui/Modal";
import { Badge, StatusChip } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { CardGridSkeleton } from "./ui/Skeleton";
import { cn } from "../lib/cn";

const META_ERROR_MESSAGES = {
  no_facebook_page_found:
    "No Facebook Page was found for that account. You need to manage at least one Page, and it must belong to a Business Portfolio.",
  oauth_failed: "Something went wrong completing the Meta login.",
};

const AVAILABLE_CHANNELS = [
  {
    platform: "instagram",
    name: "Instagram Business",
    Icon: InstagramIcon,
    iconTone: "text-social-instagram bg-social-instagram/10 border-social-instagram/30",
    description: "Publish photo carousels, reels, and stories with automated hashtags.",
  },
  {
    platform: "facebook",
    name: "Facebook Page",
    Icon: FacebookIcon,
    iconTone: "text-social-facebook bg-social-facebook/10 border-social-facebook/30",
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
  const [listLoading, setListLoading] = useState(true);
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
      return addToast(
        "error",
        "Meta OAuth isn't configured on this server — use the sandbox form below instead."
      );
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
      closeConnectModal();
      loadAccounts();
    } catch (err) {
      const reason = err.response?.data?.error;
      addToast("error", META_ERROR_MESSAGES[reason] || "Could not complete Meta connection");
    } finally {
      setConnectingPageId(null);
    }
  }

  async function loadAccounts() {
    setListLoading(true);
    try {
      const items = await api.socialAccounts.list();
      setSocialAccounts(items);
    } catch (err) {
      // ignore — widget shows empty state
    } finally {
      setListLoading(false);
    }
  }

  function closeConnectModal() {
    setIsConnectModalOpen(false);
    setMetaAccessToken(null);
    setMetaPages([]);
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
      closeConnectModal();
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
      <PageHeader
        eyebrow="Manage"
        title="Channels"
        description="Manage your authenticated social platforms, token permissions, and publishing routes."
        actions={
          <Button size="sm" onClick={() => setIsConnectModalOpen(true)}>
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
            Connect New Channel
          </Button>
        }
      />

      {listLoading ? (
        <CardGridSkeleton count={2} />
      ) : socialAccounts.length === 0 ? (
        <EmptyState
          icon={PlusIcon}
          title="No channels connected yet"
          description="Connect Instagram or Facebook to start publishing. You can also use sandbox mode to explore without a Meta app."
          action={
            <Button size="sm" onClick={() => setIsConnectModalOpen(true)}>
              <PlusIcon className="w-4 h-4" aria-hidden="true" />
              Connect your first channel
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {AVAILABLE_CHANNELS.map((ch) => {
            const { Icon } = ch;
            const connectedAccounts = socialAccounts.filter((a) => a.platform === ch.platform);

            return (
              <Card key={ch.platform} className="flex flex-col">
                <CardBody className="space-y-4 pt-5 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn("w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center shrink-0", ch.iconTone)}>
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-serif text-h3 text-ink">{ch.name}</h2>
                        <p className="text-caption text-ink-2">{ch.description}</p>
                      </div>
                    </div>
                    {connectedAccounts.length > 0 ? (
                      <Badge tone="bg-success-bg text-success border-success/30">
                        <CheckIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        {connectedAccounts.length} Connected
                      </Badge>
                    ) : (
                      <StatusChip status="inactive" />
                    )}
                  </div>

                  {connectedAccounts.length > 0 && (
                    <ul className="space-y-2" aria-label={`${ch.name} connected accounts`}>
                      {connectedAccounts.map((account) => (
                        <li
                          key={account.id}
                          className="p-3.5 rounded-[10px] bg-canvas border border-line space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-body-sm font-semibold text-ink truncate">
                              {account.displayName}
                            </span>
                            <button
                              onClick={() => handleDisconnect(account.id, account.displayName)}
                              className="text-caption text-danger hover:underline font-semibold shrink-0"
                            >
                              Disconnect
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-caption">
                            <span className="text-ink-3">Status</span>
                            <StatusChip status={account.isLive ? "live" : "sandbox"} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
                <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-2">
                  <span className="text-caption text-ink-3">
                    {connectedAccounts.length > 0 ? "Ready for automated publish" : "Not linked yet"}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedChannel(ch.platform);
                      setIsConnectModalOpen(true);
                    }}
                  >
                    {connectedAccounts.length > 0 ? "Connect Another" : "Connect Channel"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={isConnectModalOpen} onClose={closeConnectModal} labelledBy="connect-channel-title">
        {metaPages.length > 0 ? (
          <>
            <ModalHeader
              id="connect-channel-title"
              title="Choose a Facebook Page"
              subtitle={`Your Facebook account manages ${metaPages.length} Pages — pick the one to connect (and its linked Instagram account, if any).`}
              onClose={closeConnectModal}
            />
            <ul className="space-y-2">
              {metaPages.map((page) => {
                const alreadyConnected = socialAccounts.some(
                  (a) => a.platform === "facebook" && a.externalAccountId === page.id
                );
                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => connectMetaPage(metaAccessToken, page.id)}
                      disabled={connectingPageId !== null}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-canvas border border-line hover:border-brand-500/60 text-left transition disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="text-body-sm font-semibold text-ink flex items-center gap-2 flex-wrap">
                          {page.name}
                          {alreadyConnected && (
                            <Badge tone="bg-success-bg text-success border-success/30">
                              <CheckIcon className="w-3 h-3" aria-hidden="true" />
                              Connected
                            </Badge>
                          )}
                        </span>
                        {page.category && <span className="text-caption text-ink-3">{page.category}</span>}
                      </span>
                      <span className="text-body-sm text-brand-600 font-semibold shrink-0">
                        {connectingPageId === page.id
                          ? "Connecting…"
                          : alreadyConnected
                            ? "Refresh token"
                            : "Connect"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                setMetaAccessToken(null);
                setMetaPages([]);
              }}
              className="mt-4 text-body-sm text-ink-2 hover:text-ink font-medium"
            >
              ← Back
            </button>
          </>
        ) : (
          <>
            <ModalHeader
              id="connect-channel-title"
              title="Connect Social Channel"
              subtitle="Authorize publishing access for multi-platform scheduling."
              onClose={closeConnectModal}
            />
            <Button
              variant="secondary"
              onClick={handleConnectWithMeta}
              disabled={metaConnecting}
              loading={metaConnecting}
              className="w-full mb-4 !bg-[#1463c4] !text-white !border-transparent hover:brightness-110"
            >
              <FacebookIcon className="w-4 h-4" aria-hidden="true" />
              {metaConnecting ? "Waiting for Facebook…" : "Connect with Facebook (Meta OAuth)"}
            </Button>

            <div className="flex items-center my-4 text-ink-3 text-caption" aria-hidden="true">
              <div className="flex-1 border-t border-line" />
              <span className="px-3">or use sandbox mode</span>
              <div className="flex-1 border-t border-line" />
            </div>

            <p className="text-caption text-ink-2 mb-4">
              No real Meta app configured on this server? Link a demo account by name instead — it
              will not be able to publish to the real Graph API.
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <Field label="Platform">
                <Select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}>
                  <option value="instagram">Instagram Business</option>
                  <option value="facebook">Facebook Page</option>
                </Select>
              </Field>
              <Field label="Account Handle or Page ID">
                <Input
                  required
                  value={accountHandle}
                  onChange={(e) => setAccountHandle(e.target.value)}
                  placeholder="@company_official or page_109238"
                />
              </Field>
              <Field label="Display Label (Optional)">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Brand Main Page"
                />
              </Field>
              <Button type="submit" disabled={loading} loading={loading} className="w-full">
                {loading ? "Authorizing…" : "Link Channel"}
              </Button>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}
