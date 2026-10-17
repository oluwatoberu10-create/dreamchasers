"use client";

import * as React from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { sendMessageAction } from "@/server/actions/community";

type Msg = { id: string; body: string; senderId: string; createdAt: string; firstName: string; lastName: string };

const POLL_MS = 10_000;

/** The open thread polls for new messages so replies appear without a refresh. */
export function Thread({ conversationId, meId, initial }: { conversationId: string; meId: string; initial: Msg[] }) {
  const [msgs, setMsgs] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const end = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setMsgs(initial); }, [initial]);

  React.useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const after = msgs[msgs.length - 1]?.createdAt ?? new Date(0).toISOString();
      try {
        const r = await fetch(`/api/messages/${conversationId}?after=${encodeURIComponent(after)}`, { cache: "no-store" });
        if (!r.ok) return;
        const { items } = (await r.json()) as { items: Msg[] };
        if (items.length) setMsgs((m) => [...m, ...items.filter((x) => !m.some((y) => y.id === x.id))]);
      } catch { /* offline */ }
    };
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [conversationId, msgs]);

  React.useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-96 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {msgs.length === 0 && <p className="py-10 text-center text-[13.5px] text-[var(--text-muted)]">No messages yet — say hello.</p>}
        {msgs.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%]", mine ? "rounded-br-md bg-[var(--brand)] text-[var(--on-brand)]" : "rounded-bl-md bg-[var(--surface-2)]")}>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-white/75" : "text-[var(--text-subtle)]")}>{mine ? "You" : m.firstName} · {fmt(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <ActionForm action={sendMessageAction.bind(null, conversationId)} className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3" onSuccess={() => setDraft("")}>
        <Textarea name="body" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="min-h-12 flex-1" placeholder="Write a message…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement)?.requestSubmit(); }} />
        <SubmitButton disabled={!draft.trim()} aria-label="Send"><Icon name="send" className="h-4 w-4" /><span className="hidden sm:inline">Send</span></SubmitButton>
      </ActionForm>
    </div>
  );
}
