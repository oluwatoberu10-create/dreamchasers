"use client";

import * as React from "react";
import { ActionForm, ConfirmSubmit, Dialog, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { assignmentStatusAction } from "@/server/actions/teaching";
import { startConversationAction } from "@/server/actions/community";

export function AssignmentStatusControl({ assignmentId, status }: { assignmentId: string; status: "draft" | "published" | "archived" }) {
  if (status === "archived") {
    return <ActionForm action={assignmentStatusAction.bind(null, assignmentId, "published")} showErrorBanner={false}><SubmitButton variant="secondary" size="sm">Restore & publish</SubmitButton></ActionForm>;
  }
  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <ActionForm action={assignmentStatusAction.bind(null, assignmentId, "published")} showErrorBanner={false}>
          <ConfirmSubmit variant="primary" danger={false} title="Publish this assignment?" description="Learners can open it once its course is live, and will be notified." confirmLabel="Publish"><Icon name="send" className="h-3.5 w-3.5" />Publish</ConfirmSubmit>
        </ActionForm>
      )}
      <ActionForm action={assignmentStatusAction.bind(null, assignmentId, "archived")} showErrorBanner={false}>
        <ConfirmSubmit title="Archive this assignment?" description="It will be hidden from learners. Any submissions and grades are kept." confirmLabel="Archive"><Icon name="folder" className="h-3.5 w-3.5" />Archive</ConfirmSubmit>
      </ActionForm>
    </div>
  );
}

/** Quick follow-up for a learner with missing work: opens a prefilled message. */
export function FollowUp({ studentId, firstName, assignmentTitle, late }: { studentId: string; firstName: string; assignmentTitle: string; late: boolean }) {
  const [open, setOpen] = React.useState(false);
  const text = `Hi ${firstName}, I noticed "${assignmentTitle}" hasn't been handed in yet. Is everything OK? ${late ? "You can still submit it — it'll just be marked as late." : "Let me know if something got in the way."}`;
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Icon name="message" className="h-3.5 w-3.5" />Follow up</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Message ${firstName}`} description="A friendly nudge usually works best.">
        <ActionForm action={startConversationAction} className="space-y-3 pb-5" refresh={false}>
          <input type="hidden" name="recipientId" value={studentId} />
          <Textarea name="body" defaultValue={text} rows={5} aria-label="Message" />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton pendingLabel="Sending…"><Icon name="send" className="h-4 w-4" />Send</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
