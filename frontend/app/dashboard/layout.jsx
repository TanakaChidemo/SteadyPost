"use client";

import React, { useState } from "react";
import { Topbar } from "../../components/Topbar";
import { Sidebar, MobileTabBar } from "../../components/Sidebar";

export default function DashboardLayout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <Topbar onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex-1 flex w-full max-w-[1440px] mx-auto">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        {/* Content shell — template: inset wrapper, radius 14, comfortable padding */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-7 sm:py-8 lg:px-10 pb-24 md:pb-10">
          <div className="max-w-[1240px] mx-auto animate-fade-up">{children}</div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
