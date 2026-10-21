"use client";

import React from "react";
import { PageHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { InboxIcon } from "../../../components/Icons";

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Approvals"
        description="Review and approve posts before they go live. The approval workflow ships with card #07."
      />
      <EmptyState
        icon={InboxIcon}
        eyebrow="Coming soon"
        title="No posts awaiting approval"
        description="When the approval workflow launches, posts that need your sign-off will appear here."
      />
    </div>
  );
}
