"use client";

import * as React from "react";
import { ActionForm, ConfirmSubmit, Dialog, FieldMsg, SubmitButton, useFormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import {
  assignTeacherAction, changeRoleAction, deleteUserAction, enrollmentAction, resetLinkAction, revealJournalAction, setStatusAction, unassignTeacherAction, updateUserAction,
} from "@/server/actions/admin";
import { ShareLink } from "../share-link";

export function DetailsForm({ userId, firstName, lastName, email }: { userId: string; firstName: string; lastName: string; email: string }) {
  return (
    <ActionForm action={updateUserAction.bind(null, userId)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="d-first">First name</Label><Input id="d-first" name="firstName" defaultValue={firstName} className="mt-1.5" required /><FieldMsg name="firstName" /></div>
        <div><Label htmlFor="d-last">Last name</Label><Input id="d-last" name="lastName" defaultValue={lastName} className="mt-1.5" required /><FieldMsg name="lastName" /></div>
      </div>
      <div><Label htmlFor="d-email">Email</Label><Input id="d-email" name="email" type="email" defaultValue={email} className="mt-1.5" required /><FieldMsg name="email" /></div>
      <SubmitButton size="sm" pendingLabel="Saving…">Save</SubmitButton>
    </ActionForm>
  );
}

export function RoleForm({ userId, role, isSelf }: { userId: string; role: "student" | "teacher" | "super_admin"; isSelf: boolean }) {
  const [next, setNext] = React.useState(role);
  const describe = { student: "Learner dashboard; teaching duties are removed.", teacher: "Teacher dashboard; assign tracks below.", super_admin: "Full administration plus teaching tools." };
  return (
    <ActionForm action={changeRoleAction.bind(null, userId)} className="space-y-3">
      <Select name="role" value={next} onChange={(e) => setNext(e.target.value as typeof role)} aria-label="Role">
        <option value="student">Learner</option><option value="teacher">Teacher</option><option value="super_admin">Super admin</option>
      </Select>
      <p className="text-[12.5px] text-[var(--text-muted)]">{describe[next]}{isSelf && next !== "super_admin" ? " You will lose access to administration." : ""}</p>
      <ConfirmSubmit variant="primary" danger={next === "student" || (isSelf && next !== "super_admin")} confirmLabel="Change role"
        title="Change this person's role?" description={`They'll become a ${next === "super_admin" ? "super admin" : next === "teacher" ? "teacher" : "learner"}. This is recorded in the activity log.`}>
        Update role
      </ConfirmSubmit>
    </ActionForm>
  );
}

export function TrackAssign({ trackId, teacherId, assigned, disabled }: { trackId: string; teacherId: string; assigned: boolean; disabled: boolean }) {
  return assigned ? (
    <ActionForm action={unassignTeacherAction.bind(null, trackId, teacherId)} showErrorBanner={false}><SubmitButton size="sm" variant="secondary">Remove</SubmitButton></ActionForm>
  ) : (
    <ActionForm action={assignTeacherAction.bind(null, trackId)} showErrorBanner={false}><input type="hidden" name="teacherId" value={teacherId} /><SubmitButton size="sm" disabled={disabled}>Assign</SubmitButton></ActionForm>
  );
}

export function EnrollmentToggle({ programId, studentId, enrolled, programName }: { programId: string; studentId: string; enrolled: boolean; programName: string }) {
  return (
    <ActionForm action={enrollmentAction.bind(null, programId, studentId, !enrolled)} showErrorBanner={false} className="space-y-2">
      <p className="text-[13.5px]">{enrolled ? `Enrolled in ${programName}.` : `Not enrolled in ${programName}.`}</p>
      {enrolled
        ? <ConfirmSubmit title="Remove from the programme?" description="They'll lose access to its courses. Submissions and grades are kept." confirmLabel="Remove">Remove from programme</ConfirmSubmit>
        : <SubmitButton size="sm">Enrol</SubmitButton>}
    </ActionForm>
  );
}

function ResetLinkResult() {
  const s = useFormState();
  if (!s.ok || typeof s.data?.resetPath !== "string") return null;
  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-[var(--text-muted)]">{s.message}</p>
      <ShareLink path={s.data.resetPath} label="Password reset link" />
    </div>
  );
}

export function AccountControls({ userId, active, hasRecords }: { userId: string; active: boolean; hasRecords: boolean }) {
  return (
    <div className="space-y-3">
      {active && (
        <ActionForm action={resetLinkAction.bind(null, userId)} className="space-y-2">
          <ResetLinkResult />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Creating…">Create password reset link</SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={setStatusAction.bind(null, userId, active ? "deactivated" : "active")} showErrorBanner={false}>
        {active
          ? <ConfirmSubmit title="Deactivate this account?" description="They'll be signed out and can't sign in. All their learning records stay intact, and you can reactivate them at any time." confirmLabel="Deactivate">Deactivate account</ConfirmSubmit>
          : <SubmitButton size="sm">Reactivate account</SubmitButton>}
      </ActionForm>
      <ActionForm action={deleteUserAction.bind(null, userId)}>
        {hasRecords ? (
          <p className="text-[12.5px] text-[var(--text-muted)]">This account has submissions, grades or courses, so it can't be deleted — deactivate it instead to preserve those records.</p>
        ) : (
          <ConfirmSubmit title="Delete this account permanently?" description="This cannot be undone." confirmLabel="Delete">Delete account</ConfirmSubmit>
        )}
      </ActionForm>
    </div>
  );
}

const LABELS: Record<string, string> = {
  learned: "What they learned", skills: "New skills", mostUseful: "Most useful", enjoyedLearning: "Enjoyed (learning)",
  enjoyedCommunity: "Enjoyed (community)", difficult: "Difficult", improve: "To improve", goals: "Goals",
};

function Revealed() {
  const s = useFormState();
  if (!s.ok || !s.data?.content) return null;
  const content = JSON.parse(String(s.data.content)) as Record<string, string>;
  return (
    <dl className="space-y-3 border-t border-[var(--border)] pt-4 text-[13.5px]">
      {Object.entries(content).filter(([, v]) => v?.trim()).map(([k, v]) => <div key={k}><dt className="font-semibold">{LABELS[k] ?? k}</dt><dd className="whitespace-pre-wrap text-[var(--text-muted)]">{v}</dd></div>)}
    </dl>
  );
}

export function JournalReveal({ entryId, week }: { entryId: string; week: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>View…</Button>
      <Dialog open={open} onClose={() => setOpen(false)} wide title={`Week ${week} journal`} description="Journals are personal reflections. Viewing one is recorded in the activity log with your reason.">
        <ActionForm action={revealJournalAction.bind(null, entryId)} className="space-y-3 pb-5" refresh={false}>
          <div><Label htmlFor={`why-${entryId}`}>Reason</Label><Textarea id={`why-${entryId}`} name="reason" rows={2} className="mt-1.5" required placeholder="e.g. Safeguarding follow-up requested by the learner's teacher" /><FieldMsg name="reason" /></div>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Opening…">Record reason and view</SubmitButton>
          <Revealed />
        </ActionForm>
      </Dialog>
    </>
  );
}
