"use client";

import * as React from "react";
import { ActionForm, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { cn, formatDateOnly } from "@/lib/utils";
import { addTaskAction, deleteTaskAction, toggleTaskAction, updateTaskAction } from "@/server/actions/learner";

type Task = { id: string; title: string; notes: string | null; dueOn: string | null; done: boolean };

function TaskRow({ t, today }: { t: Task; today: string }) {
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <li className="px-5 py-3">
        <ActionForm action={updateTaskAction.bind(null, t.id)} className="space-y-2" onSuccess={() => setEditing(false)}>
          <Input name="title" defaultValue={t.title} aria-label="Task" required />
          <FieldMsg name="title" />
          <Input name="notes" defaultValue={t.notes ?? ""} placeholder="Notes (optional)" aria-label="Notes" />
          <div className="flex gap-2">
            <Input name="dueOn" type="date" defaultValue={t.dueOn ?? ""} aria-label="Due date" className="flex-1" />
            <SubmitButton size="md">Save</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </ActionForm>
      </li>
    );
  }
  const overdue = !t.done && t.dueOn && t.dueOn < today;
  return (
    <li className="group flex items-start gap-3 px-5 py-3">
      <ActionForm action={toggleTaskAction.bind(null, t.id, !t.done)} showErrorBanner={false}>
        <button type="submit" aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
          className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border-2", t.done ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--border-strong)] hover:border-[var(--brand)]")}>
          {t.done && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      </ActionForm>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[14px] font-medium", t.done && "text-[var(--text-subtle)] line-through")}>{t.title}</div>
        {t.notes && <div className="text-[12.5px] text-[var(--text-muted)]">{t.notes}</div>}
        {t.dueOn && <div className={cn("text-[12px]", overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--text-subtle)]")}>Due {formatDateOnly(t.dueOn, { weekday: "short", day: "numeric", month: "short" })}</div>}
      </div>
      <div className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit "${t.title}"`}><Icon name="edit" className="h-3.5 w-3.5" /></Button>
        <ActionForm action={deleteTaskAction.bind(null, t.id)} showErrorBanner={false}>
          <Button type="submit" variant="ghost" size="sm" aria-label={`Delete "${t.title}"`}><Icon name="trash" className="h-3.5 w-3.5" /></Button>
        </ActionForm>
      </div>
    </li>
  );
}

export function TaskList({ tasks, today }: { tasks: Task[]; today: string }) {
  return (
    <div>
      <ActionForm action={addTaskAction} resetOnSuccess className="flex gap-2 border-b border-[var(--border)] px-5 py-3">
        <div className="flex-1">
          <Input name="title" placeholder="Add a task…" aria-label="New task" required />
          <FieldMsg name="title" />
        </div>
        <Input name="dueOn" type="date" aria-label="Due date" className="w-36" />
        <SubmitButton size="md" aria-label="Add task"><Icon name="plus" className="h-4 w-4" /></SubmitButton>
      </ActionForm>
      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-[var(--text-muted)]">No personal tasks. Add anything you want to remember.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">{tasks.map((t) => <TaskRow key={t.id} t={t} today={today} />)}</ul>
      )}
    </div>
  );
}
