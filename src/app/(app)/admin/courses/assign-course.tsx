"use client";

import * as React from "react";
import Link from "next/link";
import { ActionForm, Dialog, FieldMsg, SubmitButton, useFormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { assignCourseAction } from "@/server/actions/admin";

type Opt = { id: string; label: string };

function Result() {
  const s = useFormState();
  if (!s.ok || !s.data) return null;
  return (
    <div className="space-y-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-[13px]">
      <p className="font-semibold text-[var(--success)]">{s.message}</p>
      <Link href={`/teach/courses/${s.data.courseId}`} className="inline-block font-semibold text-[var(--brand)] underline">Open the course</Link>
    </div>
  );
}

export function AssignCourse({ teachers, weeks, defaultWeek }: { teachers: Opt[]; weeks: Opt[]; defaultWeek: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" />Create &amp; assign course</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create & assign a course"
        description="Give it a title and pick a teacher. They add the lesson, videos, files and assignments, then publish it.">
        {teachers.length === 0 ? (
          <div className="space-y-4 pb-5 text-[13.5px]">
            <p>There are no active teachers yet. Add one, or promote someone to teacher, under <Link href="/admin/users" className="font-semibold text-[var(--brand)] underline">Users</Link>.</p>
            <div className="flex justify-end"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
          </div>
        ) : (
          <ActionForm action={assignCourseAction} className="space-y-4 pb-5" resetOnSuccess>
            <Result />
            <div><Label htmlFor="ac-title">Course title</Label><Input id="ac-title" name="title" className="mt-1.5" required maxLength={160} placeholder="e.g. Introduction to public speaking" /><FieldMsg name="title" /></div>
            <div><Label htmlFor="ac-teacher">Teacher</Label>
              <Select id="ac-teacher" name="teacherId" defaultValue="" className="mt-1.5" required>
                <option value="" disabled>Choose a teacher…</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
              <FieldMsg name="teacherId" />
            </div>
            <div><Label htmlFor="ac-week">Programme week</Label>
              <Select id="ac-week" name="weekId" defaultValue={defaultWeek} className="mt-1.5" required>
                {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
              </Select>
              <FieldMsg name="weekId" hint="The teacher can change this later." />
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button><SubmitButton pendingLabel="Creating…">Create &amp; assign</SubmitButton></div>
          </ActionForm>
        )}
      </Dialog>
    </>
  );
}
