"use client";

import * as React from "react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { relativeTime } from "@/lib/utils";
import { removeDraftFileAction, startAttemptAction, workAction } from "@/server/actions/learner";

type DraftFile = { id: string; name: string; size: string };

export function WorkEditor({ assignmentId, attemptId, body, allowText, allowFiles, uploads, requiredFilesNote, files, late, savedAt }: {
  assignmentId: string; attemptId: string | null; body: string; allowText: boolean; allowFiles: boolean; uploads: boolean;
  requiredFilesNote: string | null; files: DraftFile[]; late: boolean; savedAt: string | null;
}) {
  const [text, setText] = React.useState(body);
  const [picked, setPicked] = React.useState<File[]>([]);
  const [inputKey, setInputKey] = React.useState(0);
  const dirty = text !== body || picked.length > 0;

  // Warn before leaving with unsaved writing.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <div className="space-y-4">
      <ActionForm action={workAction.bind(null, assignmentId)} className="space-y-4" onSuccess={() => { setPicked([]); setInputKey((k) => k + 1); }}>
        {allowText && (
          <div>
            <Label htmlFor="body">Written response</Label>
            <Textarea id="body" name="body" value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mt-1.5 min-h-56" placeholder="Write your answer here…" />
            <div className="mt-1 flex justify-between text-[12px] text-[var(--text-subtle)]">
              <span>{text.trim() ? `${text.trim().split(/\s+/).length} words` : "Nothing written yet"}</span>
              <span>{dirty ? "Unsaved changes" : savedAt ? `Draft saved ${relativeTime(savedAt)}` : ""}</span>
            </div>
          </div>
        )}
        {allowFiles && !uploads && (
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--text-muted)]">
            File attachments aren&apos;t available here. {allowText ? "Share your file on Google Drive or Dropbox and paste the link in your written response." : "Ask your teacher how to hand in this work."}
          </p>
        )}
        {allowFiles && uploads && (
          <div>
            <Label htmlFor="files">Attach files</Label>
            {requiredFilesNote && <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{requiredFilesNote}</p>}
            <input key={inputKey} id="files" name="files" type="file" multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.odt,.odp,.ods,.rtf,.png,.jpg,.jpeg,.gif,.webp,.zip"
              onChange={(e) => setPicked(Array.from(e.target.files ?? []))}
              className="mt-1.5 block w-full rounded-[var(--radius-field)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-3 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-white" />
            <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Up to 5 files, 10 MB each. Documents, images or a zip.</p>
          </div>
        )}
        {late && <p className="rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] font-medium text-[var(--warning)]">The deadline has passed — this will be recorded as a late submission.</p>}
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Saving…"><Icon name="file" className="h-4 w-4" />Save draft</SubmitButton>
          <ConfirmSubmit name="intent" value="submit" variant="primary" size="md" danger={false} confirmLabel="Hand it in"
            title="Hand in your work?" description="Your teacher will be notified. You won't be able to edit this attempt afterwards — but you may be offered another attempt after it's graded.">
            <Icon name="send" className="h-4 w-4" />Submit
          </ConfirmSubmit>
        </div>
      </ActionForm>

      {files.length > 0 && attemptId && (
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">Attached to this draft</div>
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]">
                <Icon name="paperclip" className="h-4 w-4 text-[var(--text-subtle)]" />
                <a href={`/api/files/${f.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{f.name}</a>
                <span className="text-[12px] text-[var(--text-subtle)]">{f.size}</span>
                <ActionForm action={removeDraftFileAction.bind(null, attemptId, f.id)} showErrorBanner={false}>
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${f.name}`}><Icon name="trash" className="h-3.5 w-3.5" /></Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StartAttempt({ assignmentId }: { assignmentId: string }) {
  return (
    <ActionForm action={startAttemptAction.bind(null, assignmentId)} showErrorBanner={false}>
      <SubmitButton variant="star" pendingLabel="Starting…"><Icon name="repeat" className="h-4 w-4" />Start new attempt</SubmitButton>
    </ActionForm>
  );
}
