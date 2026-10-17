"use client";

import * as React from "react";
import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { ActionState } from "@/lib/action-state";

type Rubric = { criterion: string; points: number; description?: string };

export type AssignmentInitial = {
  courseId: string; kind: "assignment" | "assessment"; title: string; instructions: string; maxScore: number; passMark: number;
  dueAt: string; allowText: boolean; allowFiles: boolean; requiredFilesNote: string; acceptLate: boolean;
  resubmissionPolicy: "none" | "on_request" | "until_passed"; maxAttempts: number | null; rubric: Rubric[]; status: "draft" | "published" | "archived";
};

export function AssignmentForm({ action, courses, initial, isNew, hasSubmissions }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; courses: { id: string; label: string }[];
  initial: AssignmentInitial; isNew: boolean; hasSubmissions: boolean;
}) {
  const [max, setMax] = React.useState(initial.maxScore);
  const [pass, setPass] = React.useState(initial.passMark);
  const [rubric, setRubric] = React.useState<Rubric[]>(initial.rubric);
  const rubricTotal = rubric.reduce((a, r) => a + (Number(r.points) || 0), 0);

  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="rubric" value={JSON.stringify(rubric.filter((r) => r.criterion.trim()))} />
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div><Label htmlFor="title">Title</Label><Input id="title" name="title" defaultValue={initial.title} className="mt-1.5" required maxLength={160} /><FieldMsg name="title" /></div>
        <div><Label htmlFor="kind">Type</Label><Select id="kind" name="kind" defaultValue={initial.kind} className="mt-1.5"><option value="assignment">Assignment</option><option value="assessment">Assessment / test</option></Select></div>
      </div>
      <div>
        <Label htmlFor="courseId">Course</Label>
        <Select id="courseId" name="courseId" defaultValue={initial.courseId} className="mt-1.5" required disabled={!isNew}>
          <option value="" disabled>Choose a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        {!isNew && <input type="hidden" name="courseId" value={initial.courseId} />}
        <FieldMsg name="courseId" />
      </div>
      <div><Label htmlFor="instructions">Instructions</Label><Textarea id="instructions" name="instructions" defaultValue={initial.instructions} rows={7} className="mt-1.5" placeholder="What should learners do? Markdown formatting works here." /></div>

      <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-3">
        <legend className="px-1 text-[13px] font-bold">Scoring</legend>
        <div><Label htmlFor="maxScore">Maximum score</Label><Input id="maxScore" name="maxScore" type="number" min={1} max={1000} value={max} onChange={(e) => setMax(Number(e.target.value))} className="mt-1.5" required /><FieldMsg name="maxScore" /></div>
        <div><Label htmlFor="passMark">Pass mark</Label><Input id="passMark" name="passMark" type="number" min={0} max={max} value={pass} onChange={(e) => setPass(Number(e.target.value))} className="mt-1.5" required aria-invalid={pass > max} /><FieldMsg name="passMark" hint={max > 0 ? `${Math.round((pass / max) * 100)}% of the maximum` : undefined} /></div>
        <div><Label htmlFor="dueAt">Deadline (programme time)</Label><Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={initial.dueAt} className="mt-1.5" required /><FieldMsg name="dueAt" /></div>
        {hasSubmissions && <p className="text-[12px] text-[var(--warning)] sm:col-span-3">Learners have already handed in work. Changing the maximum or pass mark applies to future grading; existing grades keep the values they were graded against.</p>}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <legend className="px-1 text-[13px] font-bold">Submission</legend>
        <div className="flex flex-wrap gap-6">
          <Checkbox name="allowText" defaultChecked={initial.allowText} label="Written response" />
          <Checkbox name="allowFiles" defaultChecked={initial.allowFiles} label="File uploads" />
          <Checkbox name="acceptLate" defaultChecked={initial.acceptLate} label="Accept late work" hint="Marked as late, never silently re-dated." />
        </div>
        <FieldMsg name="allowText" />
        <div><Label htmlFor="requiredFilesNote">Required files (optional)</Label><Input id="requiredFilesNote" name="requiredFilesNote" defaultValue={initial.requiredFilesNote} className="mt-1.5" placeholder="e.g. A PDF of your essay plus one image" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="resubmissionPolicy">Resubmission</Label>
            <Select id="resubmissionPolicy" name="resubmissionPolicy" defaultValue={initial.resubmissionPolicy} className="mt-1.5">
              <option value="none">One attempt (unless I request a revision)</option>
              <option value="on_request">When I request a revision</option>
              <option value="until_passed">Learners may retry until they pass</option>
            </Select>
          </div>
          <div><Label htmlFor="maxAttempts">Maximum attempts</Label><Input id="maxAttempts" name="maxAttempts" type="number" min={1} max={20} defaultValue={initial.maxAttempts ?? ""} className="mt-1.5" placeholder="No limit" /><FieldMsg name="maxAttempts" /></div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <legend className="px-1 text-[13px] font-bold">Rubric (optional)</legend>
        {rubric.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
            <Input value={r.criterion} onChange={(e) => setRubric((x) => x.map((y, j) => (j === i ? { ...y, criterion: e.target.value } : y)))} placeholder="Criterion" aria-label={`Criterion ${i + 1}`} />
            <Input type="number" min={0} value={r.points} onChange={(e) => setRubric((x) => x.map((y, j) => (j === i ? { ...y, points: Number(e.target.value) } : y)))} aria-label={`Points for criterion ${i + 1}`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => setRubric((x) => x.filter((_, j) => j !== i))} aria-label={`Remove criterion ${i + 1}`}><Icon name="trash" className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setRubric((x) => [...x, { criterion: "", points: 0 }])}><Icon name="plus" className="h-4 w-4" />Add criterion</Button>
          {rubric.length > 0 && <span className={rubricTotal === max ? "text-[12.5px] text-[var(--success)]" : "text-[12.5px] font-semibold text-[var(--warning)]"}>Total {rubricTotal} / {max}{rubricTotal !== max ? " — must equal the maximum score" : ""}</span>}
        </div>
        <FieldMsg name="rubric" />
      </fieldset>

      {initial.status === "draft" && <Checkbox name="publish" defaultChecked={!isNew ? false : true} label="Publish to learners" hint="Learners are notified if the course is already live. Leave unticked to keep it as a draft." />}
      {initial.status === "published" && <input type="hidden" name="publish" value="on" />}
      <SubmitButton pendingLabel="Saving…">{isNew ? "Create assignment" : "Save changes"}</SubmitButton>
    </ActionForm>
  );
}
