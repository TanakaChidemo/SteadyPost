"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  SparklesIcon,
  UsersIcon,
  InstagramIcon,
  FacebookIcon,
  CalendarIcon,
  InboxIcon,
  SettingsIcon,
  CloseIcon,
  LogoutIcon,
} from "./Icons";
import { useAppStore } from "../lib/store";
import { api } from "../lib/apiClient";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { IconButton } from "./ui/Button";
import { cn } from "../lib/cn";

// Nav grouped under mono section labels, template style.
const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: HomeIcon, exact: true },
      { href: "/dashboard/content", label: "Content Studio", icon: SparklesIcon, badge: "AI" },
      { href: "/dashboard/approvals", label: "Approvals", icon: InboxIcon },
      { href: "/dashboard/calendar", label: "Calendar", icon: CalendarIcon },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/accounts", label: "Channels", icon: UsersIcon },
      { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

function NavList({ pathname, onNavigate }) {
  return (
    <div className="space-y-5">
      {NAV_SECTIONS.map((section) => (
        <nav key={section.label} aria-label={section.label}>
          <p className="px-3 mb-1.5 font-mono text-label uppercase text-ink-3">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname?.startsWith(item.href);
              return (
                <li key={item.href} className="relative">
                  {/* 3px forest indicator bar on the active item */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand-500 transition-opacity",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center justify-between pl-4 pr-3 py-2.5 rounded-[10px] text-body-sm font-medium",
                      "transition-all duration-200",
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-2 hover:bg-card-muted hover:text-ink"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          "w-[18px] h-[18px]",
                          isActive ? "text-brand-600" : "text-ink-3"
                        )}
                        aria-hidden="true"
                      />
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded font-mono text-micro uppercase bg-ai-100 text-ai-500 border border-ai-500/25">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </div>
  );
}

function ChannelsWidget() {
  const { socialAccounts } = useAppStore();
  const isConnected = (platform) => socialAccounts.some((a) => a.platform === platform);
  const rows = [
    { platform: "instagram", label: "Instagram", Icon: InstagramIcon, iconClass: "text-social-instagram" },
    { platform: "facebook", label: "Facebook", Icon: FacebookIcon, iconClass: "text-social-facebook" },
  ];
  return (
    <div className="p-4 rounded-lg bg-card border border-line shadow-1">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-label uppercase text-ink-2">Active channels</span>
        <Link href="/dashboard/accounts" className="text-caption text-brand-600 hover:text-brand-700 hover:underline font-semibold">
          Manage
        </Link>
      </div>
      <ul className="space-y-2.5">
        {rows.map(({ platform, label, Icon, iconClass }) => (
          <li key={platform} className="flex items-center justify-between text-body-sm text-ink-2">
            <span className="flex items-center gap-2">
              <Icon className={cn("w-4 h-4", iconClass)} aria-hidden="true" />
              {label}
            </span>
            <span
              className={cn("w-2 h-2 rounded-full", isConnected(platform) ? "bg-success" : "bg-ink-3/40")}
              role="img"
              aria-label={`${label} ${isConnected(platform) ? "connected" : "not connected"}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserCard() {
  const { user, logout } = useAppStore();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 p-3 rounded-[10px] bg-card-muted border border-line">
      <span
        aria-hidden="true"
        className="w-9 h-9 rounded-full bg-brand-500 border border-brand-600 flex items-center justify-center text-caption font-bold text-white shrink-0"
      >
        {user.name ? user.name.charAt(0).toUpperCase() : "U"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption font-semibold text-ink truncate">{user.name}</p>
        <p className="text-micro text-ink-3 truncate">{user.email}</p>
      </div>
      <IconButton label="Log out" onClick={logout} className="-mr-1">
        <LogoutIcon className="w-4 h-4" />
      </IconButton>
    </div>
  );
}

function SidebarBody({ pathname, onNavigate }) {
  return (
    <div className="flex flex-col gap-6 h-full">
      <WorkspaceSwitcher />
      <NavList pathname={pathname} onNavigate={onNavigate} />
      <ChannelsWidget />
      <div className="mt-auto space-y-3">
        <div className="p-4 rounded-lg bg-brand-50 border border-brand-500/20">
          <p className="flex items-center gap-2 text-caption font-bold text-brand-700 mb-1">
            <SparklesIcon className="w-4 h-4" aria-hidden="true" />
            AI Engine Active
          </p>
          <p className="text-body-sm text-brand-700/80 leading-relaxed">
            Cross-platform repurposing and caption generation are enabled.
          </p>
        </div>
        <UserCard />
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose }) {
  const pathname = usePathname();
  const { authReady, token, setSocialAccounts } = useAppStore();

  useEffect(() => {
    if (!authReady) return;
    api.socialAccounts.list().then(setSocialAccounts).catch(() => {});
  }, [authReady, token, setSocialAccounts]);

  return (
    <>
      {/* Desktop sidebar — template shell: fixed white 256px, border-right */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line bg-surface p-4 min-h-[calc(100dvh-4rem)] sticky top-16">
        <SidebarBody pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div className="absolute inset-0 bg-overlay/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-surface border-r border-line p-4 overflow-y-auto animate-fade-in"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-serif text-h3 text-ink">Menu</span>
              <IconButton label="Close navigation menu" onClick={onClose}>
                <CloseIcon className="w-5 h-5" />
              </IconButton>
            </div>
            <SidebarBody pathname={pathname} onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}

/** Bottom tab bar for phones — primary destinations reachable by thumb. */
export function MobileTabBar() {
  const pathname = usePathname();
  const items = NAV_SECTIONS.flatMap((s) => s.items).slice(0, 5);
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-surface/95 backdrop-blur"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-micro font-semibold transition",
                  isActive ? "text-brand-600" : "text-ink-3"
                )}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
