"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ui/action-form";
import { Label, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { initialState } from "@/lib/action-state";
import { reopenJournalAction, saveJournalAction } from "@/server/actions/learner";

type Prompt = { key: string; label: string; hint: string };
type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1500;

export function JournalEditor({ weekId, prompts, initial, status, teacherAccess }: {
  weekId: string; prompts: Prompt[]; initial: Record<string, string | undefined>; status: "draft" | "submitted" | null; teacherAccess: boolean;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(prompts.map((p) => [p.key, initial[p.key] ?? ""])));
  const [save, setSave] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const persist = React.useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSave("saving");
    const fd = new FormData();
    fd.set("weekId", weekId);
    fd.set("intent", "autosave");
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    const r = await saveJournalAction(initialState, fd);
    if (r.ok) { setSave("saved"); setSavedAt(new Date()); }
    else { setSave("error"); dirty.current = true; }
  }, [values, weekId]);

  // Debounced autosave: the learner never loses what they typed.
  React.useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [values, persist]);

  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const filled = prompts.filter((p) => values[p.key]?.trim()).length;

  return (
    <ActionForm action={saveJournalAction} className="space-y-6" onSuccess={() => { dirty.current = false; setSave("saved"); setSavedAt(new Date()); router.refresh(); }}>
      <input type="hidden" name="weekId" value={weekId} />
      {prompts.map((p, i) => (
        <div key={p.key}>
          <Label htmlFor={p.key} className="text-[14.5px]"><span className="mr-1.5 text-[var(--star)]">{i + 1}.</span>{p.label}</Label>
          <p className="mb-1.5 text-[12.5px] text-[var(--text-muted)]">{p.hint}</p>
          <Textarea id={p.key} name={p.key} value={values[p.key]} rows={3}
            onChange={(e) => { dirty.current = true; setSave("idle"); setValues((v) => ({ ...v, [p.key]: e.target.value })); }}
            onBlur={() => void persist()} />
        </div>
      ))}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <span className="flex-1 text-[12.5px] text-[var(--text-muted)]" aria-live="polite">
          {save === "saving" ? "Saving…" : save === "error" ? <span className="text-[var(--danger)]">Couldn't save — will retry</span> : savedAt ? `Saved at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `${filled} of ${prompts.length} answered`}
        </span>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Saving…">Save draft</SubmitButton>
        <ConfirmSubmit name="intent" value="submit" variant="star" size="md" danger={false} confirmLabel="Mark complete"
          title="Mark this reflection complete?"
          description={teacherAccess ? "Your teachers will be able to read it so they can support you. You can still edit it later." : "It stays private to you. You can still edit it later."}>
          <Icon name="checkCircle" className="h-4 w-4" />{status === "submitted" ? "Save changes" : "Mark complete"}
        </ConfirmSubmit>
      </div>
      {status === "submitted" && <ReopenLink weekId={weekId} />}
    </ActionForm>
  );
}

function ReopenLink({ weekId }: { weekId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button type="button" disabled={busy} className="text-[12.5px] font-semibold text-[var(--text-muted)] underline hover:text-[var(--text)]"
      onClick={async () => { setBusy(true); await reopenJournalAction(weekId, initialState); setBusy(false); router.refresh(); }}>
      Move back to a private draft
    </button>
  );
}
