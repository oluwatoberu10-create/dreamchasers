"use client";

import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Icon } from "@/components/ui/icon";
import { courseCompleteAction } from "@/server/actions/learner";
import { startConversationAction } from "@/server/actions/community";

export function CompleteToggle({ courseId, complete }: { courseId: string; complete: boolean }) {
  return (
    <ActionForm action={courseCompleteAction.bind(null, courseId, !complete)} showErrorBanner={false}>
      <SubmitButton variant={complete ? "secondary" : "star"} pendingLabel="Saving…">
        <Icon name={complete ? "refresh" : "checkCircle"} className="h-4 w-4" />{complete ? "Mark as not complete" : "Mark course complete"}
      </SubmitButton>
    </ActionForm>
  );
}

export function MessageTeacher({ teacherId, courseTitle }: { teacherId: string; courseTitle: string }) {
  return (
    <ActionForm action={startConversationAction} showErrorBanner={false} refresh={false}>
      <input type="hidden" name="recipientId" value={teacherId} />
      <input type="hidden" name="body" value="" />
      <SubmitButton variant="outline" className="w-full" size="sm" pendingLabel="Opening…" title={`Ask about ${courseTitle}`}>
        <Icon name="message" className="h-4 w-4" />Message your teacher
      </SubmitButton>
    </ActionForm>
  );
}
