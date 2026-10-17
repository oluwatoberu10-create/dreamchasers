"use client";

import * as React from "react";
import { ActionForm, ConfirmSubmit, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { addDays, programEndDate, weekdayOf, WEEKDAYS } from "@/lib/dates";
import {
  assignTeacherAction, deleteTrackAction, makeCurrentProgramAction, saveProgramAction, saveSettingsAction, saveTrackAction, saveWeekAction, unassignTeacherAction,
} from "@/server/actions/admin";

const ZONES = ["Europe/London", "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "UTC"];

type ProgramInitial = { name: string; description: string; startDate: string; weeksCount: number; timezone: string; weekStartDay: number; reminderDaysBefore: number; reminderHour: number; status: string };

export function ProgramForm({ programId, initial }: { programId: string | null; initial: ProgramInitial }) {
  const [start, setStart] = React.useState(initial.startDate);
  const [weeks, setWeeks] = React.useState(initial.weeksCount);
  const [wsd, setWsd] = React.useState(initial.weekStartDay);
  const [lead, setLead] = React.useState(initial.reminderDaysBefore);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const mismatch = valid && weekdayOf(start) !== wsd;
  const zones = ZONES.includes(initial.timezone) ? ZONES : [initial.timezone, ...ZONES];

  return (
    <ActionForm action={saveProgramAction.bind(null, programId)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div><Label htmlFor={`p-name-${programId}`}>Name</Label><Input id={`p-name-${programId}`} name="name" defaultValue={initial.name} className="mt-1.5" required placeholder="e.g. Spring 2027 Cohort" /><FieldMsg name="name" /></div>
        <div><Label htmlFor={`p-status-${programId}`}>Status</Label><Select id={`p-status-${programId}`} name="status" defaultValue={initial.status} className="mt-1.5"><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></Select></div>
      </div>
      <div><Label htmlFor={`p-desc-${programId}`}>Description</Label><Textarea id={`p-desc-${programId}`} name="description" defaultValue={initial.description} rows={2} className="mt-1.5" /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor={`p-start-${programId}`}>Start date</Label><Input id={`p-start-${programId}`} name="startDate" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" required aria-invalid={mismatch} /><FieldMsg name="startDate" /></div>
        <div><Label htmlFor={`p-weeks-${programId}`}>Number of weeks</Label><Input id={`p-weeks-${programId}`} name="weeksCount" type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="mt-1.5" required /><FieldMsg name="weeksCount" /></div>
        <div><Label>End date</Label><div className="mt-1.5 flex h-10 items-center rounded-[var(--radius-field)] bg-[var(--surface-2)] px-3 text-sm font-semibold">{valid && weeks > 0 ? programEndDate(start, weeks) : "—"}</div></div>
      </div>
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <button type="button" className="rounded-full border border-[var(--border)] px-2.5 py-1 font-semibold hover:bg-[var(--surface-2)]" onClick={() => setWeeks(12)}>12 weeks</button>
        <button type="button" className="rounded-full border border-[var(--border)] px-2.5 py-1 font-semibold hover:bg-[var(--surface-2)]" onClick={() => setWeeks(13)}>13 weeks</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor={`p-tz-${programId}`}>Programme timezone</Label><Select id={`p-tz-${programId}`} name="timezone" defaultValue={initial.timezone} className="mt-1.5">{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</Select><FieldMsg name="timezone" hint="All week boundaries, deadlines and reminders use this zone." /></div>
        <div><Label htmlFor={`p-wsd-${programId}`}>Weeks start on</Label><Select id={`p-wsd-${programId}`} name="weekStartDay" value={wsd} onChange={(e) => setWsd(Number(e.target.value))} className="mt-1.5">{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
          {mismatch && <p className="mt-1.5 text-[12px] font-medium text-[var(--warning)]">{start} is a {WEEKDAYS[weekdayOf(start)]}. <button type="button" className="underline" onClick={() => setStart(addDays(start, (wsd - weekdayOf(start) + 7) % 7))}>Move to the next {WEEKDAYS[wsd]}</button></p>}
        </div>
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-2">
        <legend className="px-1 text-[13px] font-bold">Teacher course-upload reminders</legend>
        <div><Label htmlFor={`p-lead-${programId}`}>Days before a week starts</Label><Input id={`p-lead-${programId}`} name="reminderDaysBefore" type="number" min={0} max={14} value={lead} onChange={(e) => setLead(Number(e.target.value))} className="mt-1.5" /><FieldMsg name="reminderDaysBefore" /></div>
        <div><Label htmlFor={`p-hour-${programId}`}>From this local hour</Label><Select id={`p-hour-${programId}`} name="reminderHour" defaultValue={initial.reminderHour} className="mt-1.5">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></div>
        <p className="text-[12.5px] text-[var(--text-muted)] sm:col-span-2">Teachers whose course for an upcoming week isn&apos;t published or scheduled get one email {lead === 0 ? "on the day the week starts" : `${lead} day${lead === 1 ? "" : "s"} before it starts`}. Each teacher gets at most one reminder per track per week; it stops once the course is published.</p>
      </fieldset>
      <SubmitButton pendingLabel="Saving…">{programId ? "Save programme" : "Create programme"}</SubmitButton>
    </ActionForm>
  );
}

export function WeekRow({ weekId, number, title, theme, range, current }: { weekId: string; number: number; title: string; theme: string; range: string; current: boolean }) {
  const [edit, setEdit] = React.useState(false);
  return (
    <li className="px-5 py-3">
      {edit ? (
        <ActionForm action={saveWeekAction.bind(null, weekId)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSuccess={() => setEdit(false)}>
          <Input name="title" defaultValue={title} aria-label={`Week ${number} title`} required />
          <Input name="theme" defaultValue={theme} aria-label={`Week ${number} theme`} placeholder="Theme (optional)" />
          <SubmitButton size="md">Save</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
        </ActionForm>
      ) : (
        <div className="flex items-center gap-3 text-[13.5px]">
          <span className="w-10 font-bold text-[var(--text-muted)]">W{number}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span><span className="text-[12px] text-[var(--text-subtle)]">{range}{theme ? ` · ${theme}` : ""}</span></span>
          {current && <Badge tone="brand">Current</Badge>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(true)} aria-label={`Edit week ${number}`}><Icon name="edit" className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </li>
  );
}

export function TrackEditor({ programId, trackId, weeks, initial }: { programId: string; trackId: string | null; weeks: number; initial: { name: string; description: string; color: string; weekFrom: number; weekTo: number } }) {
  return (
    <div className="space-y-3">
      <ActionForm action={saveTrackAction.bind(null, programId, trackId)} className="space-y-3" resetOnSuccess={!trackId}>
        <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
          <div><Input name="name" defaultValue={initial.name} placeholder="Track name, e.g. Mathematics" aria-label="Track name" required /><FieldMsg name="name" /></div>
          <Input name="color" type="color" defaultValue={initial.color} aria-label="Colour" className="h-10 p-1" />
        </div>
        <Input name="description" defaultValue={initial.description} placeholder="Short description (optional)" aria-label="Description" />
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor={`wf-${trackId}`}>First week</Label><Input id={`wf-${trackId}`} name="weekFrom" type="number" min={1} max={weeks} defaultValue={initial.weekFrom} className="mt-1.5" /></div>
          <div><Label htmlFor={`wt-${trackId}`}>Last week</Label><Input id={`wt-${trackId}`} name="weekTo" type="number" min={1} max={weeks} defaultValue={initial.weekTo} className="mt-1.5" /><FieldMsg name="weekTo" /></div>
        </div>
        <SubmitButton size="sm" pendingLabel="Saving…">{trackId ? "Save track" : "Add track"}</SubmitButton>
      </ActionForm>
      {trackId && (
        <ActionForm action={deleteTrackAction.bind(null, trackId)} showErrorBanner={false}>
          <ConfirmSubmit variant="ghost" title="Delete this track?" description="Only possible when it has no courses. Teacher assignments for it are removed." confirmLabel="Delete track">Delete track</ConfirmSubmit>
        </ActionForm>
      )}
    </div>
  );
}

export function TrackTeacherAssign({ trackId, assigned, staff }: { trackId: string; assigned: { id: string; firstName: string; lastName: string }[]; staff: { id: string; firstName: string; lastName: string }[] }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {assigned.length === 0 && <span className="text-[12.5px] font-semibold text-[var(--danger)]">No teacher assigned — nobody will be reminded.</span>}
        {assigned.map((a) => (
          <ActionForm key={a.id} action={unassignTeacherAction.bind(null, trackId, a.id)} showErrorBanner={false}>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] py-0.5 pl-2.5 pr-1 text-[12.5px] font-semibold">
              {a.firstName} {a.lastName}
              <button type="submit" className="rounded-full p-0.5 hover:bg-[var(--surface-3)]" aria-label={`Remove ${a.firstName} ${a.lastName}`}><Icon name="x" className="h-3 w-3" /></button>
            </span>
          </ActionForm>
        ))}
      </div>
      {staff.length > 0 && (
        <ActionForm action={assignTeacherAction.bind(null, trackId)} className="flex gap-2">
          <Select name="teacherId" defaultValue="" aria-label="Assign a teacher" className="h-9 max-w-xs text-[13px]" required>
            <option value="" disabled>Assign a teacher…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </Select>
          <SubmitButton size="sm">Assign</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function PlatformForm({ initial }: { initial: { notifyAdminsOnSubmission: boolean; teacherJournalAccess: boolean; autoEnrollNewStudents: boolean; allowRevisitPastCourses: boolean; deadlineReminderHours: number } }) {
  return (
    <ActionForm action={saveSettingsAction} className="space-y-4">
      <Checkbox name="teacherJournalAccess" defaultChecked={initial.teacherJournalAccess} label="Teachers can read completed journal entries" hint="Drafts are always private. Learners are told whether teachers can read their reflections." />
      <Checkbox name="notifyAdminsOnSubmission" defaultChecked={initial.notifyAdminsOnSubmission} label="Notify super admins of every submission" />
      <Checkbox name="allowRevisitPastCourses" defaultChecked={initial.allowRevisitPastCourses} label="Learners can reopen earlier weeks' courses" hint="Courses a learner has been asked to repeat always stay open." />
      <div><Label htmlFor="deadlineReminderHours">"Due soon" notification</Label>
        <div className="mt-1.5 flex items-center gap-2"><Input id="deadlineReminderHours" name="deadlineReminderHours" type="number" min={1} max={168} defaultValue={initial.deadlineReminderHours} className="w-24" /><span className="text-[13px] text-[var(--text-muted)]">hours before a deadline</span></div>
        <FieldMsg name="deadlineReminderHours" />
      </div>
      <SubmitButton pendingLabel="Saving…">Save rules</SubmitButton>
    </ActionForm>
  );
}

export function MakeCurrent({ programId }: { programId: string }) {
  return (
    <ActionForm action={makeCurrentProgramAction.bind(null, programId)} showErrorBanner={false}>
      <ConfirmSubmit variant="secondary" danger={false} title="Make this the current programme?" description="Dashboards, reminders and new registrations will switch to it." confirmLabel="Make current">Make current</ConfirmSubmit>
    </ActionForm>
  );
}
