"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Icon } from "@/components/ui/icon";
import { runJobsAction } from "@/server/actions/admin";

export function RunJobs() {
  return (
    <ActionForm action={runJobsAction} showErrorBanner={false}>
      <SubmitButton variant="secondary" pendingLabel="Running…"><Icon name="refresh" className="h-4 w-4" />Run jobs now</SubmitButton>
    </ActionForm>
  );
}
