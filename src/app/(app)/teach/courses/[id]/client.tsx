"use client";

import * as React from "react";
import { ActionForm, ConfirmSubmit, FieldMsg, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  addLinkAction, archiveCourseAction, deleteCourseAction, publicationAction, removeResourceAction, resolveRepeatAction, uploadResourcesAction,
} from "@/server/actions/teaching";

export function PublishControl({ courseId, scheduled, defaultAt }: { courseId: string; scheduled: boolean; defaultAt: string }) {
  const [mode, setMode] = React.useState<"now" | "schedule">("now");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 rounded-lg border border-[var(--border)] p-0.5 text-[12.5px] font-semibold" role="tablist">
        {(["now", "schedule"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-md py-1.5", mode === m ? "bg-[var(--brand)] text-[var(--on-brand)]" : "text-[var(--text-muted)]")}>
            {m === "now" ? "Publish now" : "Schedule"}
          </button>
        ))}
      </div>
      <ActionForm action={publicationAction.bind(null, courseId)} className="space-y-3">
        <input type="hidden" name="mode" value={mode} />
        {mode === "schedule" && (
          <div>
            <Label htmlFor="publishAt">Opens at (programme time)</Label>
            <Input id="publishAt" name="publishAt" type="datetime-local" defaultValue={defaultAt} className="mt-1.5" required />
            <FieldMsg name="publishAt" />
          </div>
        )}
        {mode === "now" ? (
          <ConfirmSubmit variant="primary" size="md" danger={false} className="w-full" confirmLabel="Publish" title="Publish this course?" description="Every enrolled learner will be notified and can open it straight away.">
            <Icon name="send" className="h-4 w-4" />Publish now
          </ConfirmSubmit>
        ) : (
          <SubmitButton className="w-full" pendingLabel="Scheduling…"><Icon name="clock" className="h-4 w-4" />{scheduled ? "Reschedule" : "Schedule"}</SubmitButton>
        )}
      </ActionForm>
      {scheduled && (
        <ActionForm action={publicationAction.bind(null, courseId)} showErrorBanner={false}>
          <input type="hidden" name="mode" value="draft" />
          <SubmitButton variant="ghost" size="sm" className="w-full">Cancel schedule (back to draft)</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function ArchiveControl({ courseId, archived, canDelete }: { courseId: string; archived: boolean; canDelete: boolean }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={archiveCourseAction.bind(null, courseId, archived)} showErrorBanner={false}>
        {archived
          ? <SubmitButton variant="secondary" size="sm"><Icon name="refresh" className="h-3.5 w-3.5" />Restore</SubmitButton>
          : <ConfirmSubmit title="Archive this course?" description="It will be hidden from learners. Their submissions, grades and feedback are kept, and you can restore it later." confirmLabel="Archive"><Icon name="folder" className="h-3.5 w-3.5" />Archive</ConfirmSubmit>}
      </ActionForm>
      {canDelete && (
        <ActionForm action={deleteCourseAction.bind(null, courseId)} showErrorBanner={false}>
          <ConfirmSubmit title="Delete this course permanently?" description="This can't be undone. Courses with learner submissions can't be deleted — archive them instead." confirmLabel="Delete"><Icon name="trash" className="h-3.5 w-3.5" />Delete</ConfirmSubmit>
        </ActionForm>
      )}
    </div>
  );
}

export function ResourceUploader({ courseId, uploads }: { courseId: string; uploads: boolean }) {
  const [tab, setTab] = React.useState<"file" | "link">(uploads ? "file" : "link");
  const [key, setKey] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-[12.5px] font-semibold">
        {(uploads ? ["file", "link"] as const : ["link"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5", tab === t ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]")}>
            {t === "file" ? "Upload files" : "Add a link or video"}
          </button>
        ))}
      </div>
      {!uploads && <p className="text-[12.5px] text-[var(--text-muted)]">File uploads aren&apos;t available on this deployment. Put videos on YouTube or Vimeo and files on Google Drive or Dropbox, then add the link here.</p>}
      {tab === "file" ? (
        <ActionForm action={uploadResourcesAction.bind(null, courseId)} className="space-y-3" onSuccess={() => setKey((k) => k + 1)}>
          <input key={key} name="files" type="file" multiple required aria-label="Files"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.odt,.odp,.ods,.rtf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mp3,.m4a,.wav,.zip"
            className="block w-full rounded-[var(--radius-field)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-3 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-white" />
          <Input name="title" placeholder="Title (optional, for a single file)" aria-label="Title" />
          <Checkbox name="downloadable" defaultChecked label="Learners can download" hint="Untick to allow viewing in the browser only (PDFs, images, video)." />
          <p className="text-[12px] text-[var(--text-subtle)]">PDF, Office, images, audio, MP4/WebM video or zip — up to 25 MB each. For longer videos, add a link instead.</p>
          <SubmitButton size="sm" pendingLabel="Uploading…"><Icon name="upload" className="h-4 w-4" />Upload</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={addLinkAction} className="space-y-3" resetOnSuccess>
          <input type="hidden" name="courseId" value={courseId} />
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div><Input name="title" placeholder="Title" aria-label="Title" required /><FieldMsg name="title" /></div>
            <Select name="kind" defaultValue="link" aria-label="Type"><option value="link">Link</option><option value="video">Video</option></Select>
          </div>
          <div><Input name="url" type="url" placeholder="https://…" aria-label="URL" required /><FieldMsg name="url" /></div>
          <SubmitButton size="sm" pendingLabel="Adding…"><Icon name="link" className="h-4 w-4" />Add</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function RemoveResource({ resourceId, title }: { resourceId: string; title: string }) {
  return (
    <ActionForm action={removeResourceAction.bind(null, resourceId)} showErrorBanner={false}>
      <ConfirmSubmit variant="ghost" title={`Remove "${title}"?`} description="Learners will no longer see it. Uploaded files are deleted." confirmLabel="Remove"><Icon name="trash" className="h-3.5 w-3.5" /><span className="sr-only">Remove</span></ConfirmSubmit>
    </ActionForm>
  );
}

export function ResolveRepeat({ repeatId }: { repeatId: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <ActionForm action={resolveRepeatAction.bind(null, repeatId, "completed")} showErrorBanner={false}><SubmitButton size="sm" variant="secondary">Mark complete</SubmitButton></ActionForm>
      <ActionForm action={resolveRepeatAction.bind(null, repeatId, "cancelled")} showErrorBanner={false}><Button type="submit" size="sm" variant="ghost">Cancel</Button></ActionForm>
    </div>
  );
}
