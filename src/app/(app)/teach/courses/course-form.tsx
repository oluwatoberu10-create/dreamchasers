"use client";

import * as React from "react";
import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/action-state";
import { MarkdownPreview } from "./markdown-preview";

type Opt = { id: string; label: string };

export function CourseForm({ action, tracks, weeks, teachers, initial, submitLabel }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  tracks: Opt[]; weeks: Opt[]; teachers?: Opt[];
  initial: { title: string; summary: string; content: string; objectives: string; evaluationCriteria: string; trackId: string; weekId: string; teacherId?: string };
  submitLabel: string;
}) {
  const [content, setContent] = React.useState(initial.content);
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  return (
    <ActionForm action={action} className="space-y-5">
      <div>
        <Label htmlFor="title">Course title</Label>
        <Input id="title" name="title" defaultValue={initial.title} className="mt-1.5" required maxLength={160} placeholder="e.g. Fractions, decimals and percentages" />
        <FieldMsg name="title" />
      </div>
      <div className={cn("grid gap-4", teachers ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <div>
          <Label htmlFor="trackId">Track <span className="font-normal text-[var(--text-muted)]">(optional)</span></Label>
          <Select id="trackId" name="trackId" defaultValue={initial.trackId} className="mt-1.5">
            <option value="">None: a course of its own</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <FieldMsg name="trackId" />
        </div>
        <div>
          <Label htmlFor="weekId">Programme week</Label>
          <Select id="weekId" name="weekId" defaultValue={initial.weekId} className="mt-1.5" required>
            <option value="" disabled>Choose…</option>
            {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </Select>
          <FieldMsg name="weekId" />
        </div>
        {teachers && (
          <div>
            <Label htmlFor="teacherId">Presenting teacher</Label>
            <Select id="teacherId" name="teacherId" defaultValue={initial.teacherId} className="mt-1.5">
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="summary">Short description</Label>
        <Input id="summary" name="summary" defaultValue={initial.summary} className="mt-1.5" maxLength={400} placeholder="One sentence learners see on the course card." />
        <FieldMsg name="summary" />
      </div>
      <div>
        <Label htmlFor="objectives">Learning objectives</Label>
        <Textarea id="objectives" name="objectives" defaultValue={initial.objectives} rows={4} className="mt-1.5" placeholder={"One per line, e.g.\nConvert fractions to percentages\nCompare quantities in different forms"} />
        <FieldMsg name="objectives" hint="One objective per line." />
      </div>
      <div>
        <div className="flex items-end justify-between">
          <Label htmlFor="content">Lesson content</Label>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-[12.5px] font-semibold" role="tablist">
            {(["write", "preview"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cn("rounded-md px-2.5 py-1 capitalize", tab === t ? "bg-[var(--brand)] text-[var(--on-brand)]" : "text-[var(--text-muted)]")}>{t}</button>
            ))}
          </div>
        </div>
        <Textarea id="content" name="content" value={content} onChange={(e) => setContent(e.target.value)} rows={16}
          className={cn("mt-1.5 font-mono text-[13px]", tab === "preview" && "hidden")}
          placeholder={"# Heading\nWrite the lesson here. **Bold**, *italic*, lists with -, links like [text](https://…)."} />
        {tab === "preview" && <div className="mt-1.5 min-h-64 rounded-[var(--radius-field)] border border-[var(--border)] p-4"><MarkdownPreview source={content} /></div>}
        <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">Formatting: # headings, **bold**, *italic*, - lists, 1. numbered lists, &gt; quotes, `code`, [links](https://…).</p>
      </div>
      <div>
        <Label htmlFor="evaluationCriteria">Evaluation criteria</Label>
        <Textarea id="evaluationCriteria" name="evaluationCriteria" defaultValue={initial.evaluationCriteria} rows={3} className="mt-1.5" placeholder="How learners' work this week will be judged." />
      </div>
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
