"use client";

import React from "react";
import { PageHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { CalendarIcon } from "../../../components/Icons";

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title="Content Calendar"
        description="See every scheduled and published post in one place."
      />
      <EmptyState
        icon={CalendarIcon}
        eyebrow="Empty"
        title="Nothing scheduled yet"
        description="Schedule your first post from the Content Studio and it will show up here."
      />
    </div>
  );
}
