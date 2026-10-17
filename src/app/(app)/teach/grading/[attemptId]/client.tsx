"use client";

import * as React from "react";
import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { gradeAction, requireRepeatAction } from "@/server/actions/teaching";

type Rubric = { criterion: string; points: number; description?: string };

export function GradeForm({ attemptId, maxScore, passMark, rubric, initial }: {
  attemptId: string; maxScore: number; passMark: number; rubric: Rubric[];
  initial: { score: number; feedback: string; revision: boolean; rubricScores: Record<string, number> } | null;
}) {
  const [parts, setParts] = React.useState<Record<string, number>>(initial?.rubricScores ?? {});
  const fromRubric = rubric.length > 0;
  const rubricTotal = rubric.reduce((a, r) => a + (parts[r.criterion] ?? 0), 0);
  const [manual, setManual] = React.useState<string>(initial ? String(initial.score) : "");
  const score = fromRubric ? rubricTotal : manual === "" ? null : Number(manual);
  const [revision, setRevision] = React.useState(initial?.revision ?? false);

  const invalid = score !== null && (!Number.isInteger(score) || score < 0 || score > maxScore);
  const passes = score !== null && !invalid && score >= passMark;

  return (
    <ActionForm action={gradeAction} className="space-y-4">
      <input type="hidden" name="attemptId" value={attemptId} />
      <input type="hidden" name="rubricScores" value={JSON.stringify(parts)} />
      {fromRubric ? (
        <div className="space-y-2">
          {rubric.map((r) => (
            <div key={r.criterion} className="flex items-center gap-3">
              <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold">{r.criterion}</div>{r.description && <div className="text-[12px] text-[var(--text-muted)]">{r.description}</div>}</div>
              <Input type="number" min={0} max={r.points} value={parts[r.criterion] ?? ""} aria-label={`${r.criterion} score`} className="w-20 text-right"
                onChange={(e) => setParts((p) => ({ ...p, [r.criterion]: Math.max(0, Math.min(r.points, Number(e.target.value) || 0)) }))} />
              <span className="tnum w-10 text-[12.5px] text-[var(--text-subtle)]">/ {r.points}</span>
            </div>
          ))}
          <input type="hidden" name="score" value={rubricTotal} />
        </div>
      ) : (
        <div>
          <Label htmlFor="score">Score</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input id="score" name="score" type="number" min={0} max={maxScore} step={1} value={manual} onChange={(e) => setManual(e.target.value)} className="w-28 text-right text-[18px] font-bold" required aria-invalid={invalid} />
            <span className="tnum text-[15px] text-[var(--text-muted)]">/ {maxScore}</span>
          </div>
          <FieldMsg name="score" />
        </div>
      )}

      <div aria-live="polite" className={cn("rounded-lg px-3 py-2.5 text-[13px] font-semibold",
        score === null ? "bg-[var(--surface-2)] text-[var(--text-muted)]"
        : invalid ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : revision ? "bg-[var(--warning-soft)] text-[var(--warning)]"
        : passes ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--star-soft)] text-[var(--star)]")}>
        {score === null ? `Enter a score out of ${maxScore}.`
          : invalid ? `Scores must be whole numbers from 0 to ${maxScore}.`
          : revision ? `${score}/${maxScore} — the learner will be asked to revise and resubmit.`
          : passes ? `${score}/${maxScore} — meets the pass mark of ${passMark}.`
          : `${score}/${maxScore} — below the pass mark of ${passMark}. The learner will see "Keep learning".`}
      </div>

      <div>
        <Label htmlFor="feedback">Feedback</Label>
        <Textarea id="feedback" name="feedback" defaultValue={initial?.feedback ?? ""} rows={7} className="mt-1.5" placeholder="One strength, one next step. Markdown works here." />
      </div>
      <Checkbox name="requestRevision" checked={revision} onChange={(e) => setRevision(e.target.checked)} label="Request a revision" hint="Opens another attempt for the learner, whatever the score. This attempt and its grade are kept." />
      <SubmitButton className="w-full" disabled={score === null || invalid} pendingLabel="Saving…"><Icon name="checkCircle" className="h-4 w-4" />{initial ? "Update grade" : "Save grade & notify learner"}</SubmitButton>
    </ActionForm>
  );
}

export function RepeatForm({ courseId, studentId, firstName }: { courseId: string; studentId: string; firstName: string }) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--brand)] hover:underline"><Icon name="repeat" className="h-4 w-4" />Ask {firstName} to revisit this course</button>;
  return (
    <ActionForm action={requireRepeatAction} className="space-y-3" onSuccess={() => setOpen(false)}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div><Label htmlFor="reason">Why</Label><Textarea id="reason" name="reason" rows={2} className="mt-1.5" required placeholder="e.g. Scored 55 against a pass mark of 70." /><FieldMsg name="reason" /></div>
      <div><Label htmlFor="guidance">Guidance for {firstName}</Label><Textarea id="guidance" name="guidance" rows={3} className="mt-1.5" placeholder="What to focus on before trying again." /></div>
      <p className="text-[12px] text-[var(--text-muted)]">{firstName} will see "Keep learning — ready for another attempt". Previous attempts, scores and feedback stay in their record.</p>
      <SubmitButton size="sm" pendingLabel="Saving…">Open the course for another go</SubmitButton>
    </ActionForm>
  );
}
