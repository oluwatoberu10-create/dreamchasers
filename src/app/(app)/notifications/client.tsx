"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Icon } from "@/components/ui/icon";
import { markAllReadAction, markReadAction } from "@/server/actions/community";

export function MarkAll() {
  return (
    <ActionForm action={markAllReadAction} showErrorBanner={false}>
      <SubmitButton variant="secondary" pendingLabel="Marking…"><Icon name="check" className="h-4 w-4" />Mark all as read</SubmitButton>
    </ActionForm>
  );
}

export function MarkOne({ id }: { id: string }) {
  return (
    <ActionForm action={markReadAction.bind(null, [id])} showErrorBanner={false}>
      <SubmitButton variant="ghost" size="sm" aria-label="Mark as read" title="Mark as read"><Icon name="check" className="h-4 w-4" /></SubmitButton>
    </ActionForm>
  );
}
