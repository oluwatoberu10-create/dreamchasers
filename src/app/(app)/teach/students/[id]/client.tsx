"use client";

import * as React from "react";
import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Select, Textarea } from "@/components/ui/field";
import { saveEvaluationAction } from "@/server/actions/teaching";

export function EvaluationForm({ weekId, studentId, initial, weeks }: {
  weekId: string; studentId: string; initial: string; weeks: { id: string; label: string; comment: string }[];
}) {
  const [week, setWeek] = React.useState(weekId);
  const current = weeks.find((w) => w.id === week);
  return (
    <ActionForm action={saveEvaluationAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <Select name="weekId" value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
        {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}{w.comment ? " ✓" : ""}</option>)}
      </Select>
      <Textarea key={week} name="comment" defaultValue={current?.comment ?? initial} rows={4} placeholder="How did this learner do this week? What should they focus on next?" aria-label="Evaluation comment" required />
      <FieldMsg name="comment" />
      <SubmitButton size="sm" pendingLabel="Saving…">Save evaluation</SubmitButton>
    </ActionForm>
  );
}
