"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn, relativeTime } from "@/lib/utils";

type Item = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string; type: string };

const POLL_MS = 60_000;

/**
 * Header bell. Polls /api/notifications every 60s while the tab is visible (and
 * when it regains focus). Only the badge updates — the page isn't re-rendered.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch { /* offline — try again next tick */ }
  }, []);

  React.useEffect(() => { setUnread(initialUnread); }, [initialUnread]);

  React.useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    void load();
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, load]);

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    await load();
    router.refresh();
  }

  async function openItem(item: Item) {
    setOpen(false);
    if (!item.readAt) {
      await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id] }) });
      setUnread((u) => Math.max(0, u - 1));
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="tnum absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[var(--danger)] px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-[var(--surface)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Recent notifications" className="anim-pop absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--overlay)] shadow-[var(--shadow-overlay)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="text-[14px] font-bold">Notifications</span>
            {unread > 0 && <button type="button" onClick={markAll} className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Mark all as read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">You're all caught up.</p>
            ) : items.map((n) => {
              const body = (
                <>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-[var(--brand)]")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13.5px] leading-snug", n.readAt ? "font-medium text-[var(--text-muted)]" : "font-bold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[12.5px] text-[var(--text-muted)]">{n.body}</span>}
                    <span className="mt-1 block text-[11.5px] text-[var(--text-subtle)]">{relativeTime(n.createdAt)}</span>
                  </span>
                </>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} onClick={() => openItem(n)} className="flex gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 hover:bg-[var(--surface-2)]">{body}</Link>
              ) : (
                <button key={n.id} type="button" onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-0 hover:bg-[var(--surface-2)]">{body}</button>
              );
            })}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[var(--border)] px-4 py-3 text-center text-[13px] font-semibold text-[var(--brand)] hover:bg-[var(--surface-2)]">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
