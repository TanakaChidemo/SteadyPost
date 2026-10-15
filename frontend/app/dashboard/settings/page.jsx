"use client";

import React from "react";
import { PageHeader } from "../../../components/ui/Card";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { useAppStore } from "../../../lib/store";

export default function SettingsPage() {
  const { user } = useAppStore();
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Manage your SteadyPost workspace preferences."
      />
      <Card>
        <CardHeader
          eyebrow="Account"
          title="Account"
          subtitle="Signed-in account details."
        />
        <CardBody>
          <dl className="space-y-3 text-body-sm">
            <div className="flex justify-between gap-4 pb-3 border-b border-line-subtle">
              <dt className="text-ink-3">Name</dt>
              <dd className="text-ink font-medium">{user?.name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-3">Email</dt>
              <dd className="text-ink font-medium">{user?.email || "—"}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          eyebrow="Workspace"
          title="Workspace"
          subtitle="Defaults applied to new posts."
        />
        <CardBody>
          <p className="text-body-sm text-ink-3">
            Workspace defaults and notification preferences will live here.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
