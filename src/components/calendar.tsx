"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/icon";

export type CalEvent = {
  id: string; date: string; time?: string; title: string; subtitle?: string;
  kind: "course" | "upcoming" | "deadline" | "assessment" | "milestone" | "reflection" | "missing" | "draft";
  href?: string; color?: string;
};

const KIND: Record<CalEvent["kind"], { label: string; icon: IconName; cls: string }> = {
  course: { label: "Course published", icon: "book", cls: "bg-[var(--success-soft)] text-[var(--success)]" },
  upcoming: { label: "Scheduled", icon: "clock", cls: "bg-[var(--info-soft)] text-[var(--info)]" },
  deadline: { label: "Deadline", icon: "edit", cls: "bg-[var(--brand-soft)] text-[var(--brand)]" },
  assessment: { label: "Assessment", icon: "target", cls: "bg-[var(--star-soft)] text-[var(--star)]" },
  milestone: { label: "Milestone", icon: "star", cls: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
  reflection: { label: "Reflection", icon: "journal", cls: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
  missing: { label: "Course needed", icon: "alert", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  draft: { label: "Draft", icon: "file", cls: "bg-[var(--warning-soft)] text-[var(--warning)]" },
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parts(d: string) { const [y, m, day] = d.split("-").map(Number); return { y, m, day }; }
function iso(y: number, m: number, d: number) { return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const { y, m, day } = parts(d); return iso(y, m, day + n); }
function mondayOf(d: string) { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, -((dow + 6) % 7)); }
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${d}T00:00:00Z`));

function EventChip({ e, compact }: { e: CalEvent; compact?: boolean }) {
  const k = KIND[e.kind];
  const inner = (
    <>
      <span className="h-full w-1 shrink-0 self-stretch rounded-full" style={{ background: e.color ?? "var(--border-strong)" }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-semibold", compact ? "text-[11.5px]" : "text-[13px]")}>{e.time && !compact ? `${e.time} · ` : ""}{e.title}</span>
        {!compact && e.subtitle && <span className="block truncate text-[12px] text-[var(--text-muted)]">{e.subtitle}</span>}
      </span>
    </>
  );
  const cls = cn("flex w-full items-stretch gap-1.5 rounded-md px-1.5 py-1 text-left", k.cls, e.href && "hover:brightness-95");
  return e.href ? <Link href={e.href} className={cls} title={`${k.label}: ${e.title}`}>{inner}</Link> : <div className={cls} title={`${k.label}: ${e.title}`}>{inner}</div>;
}

export function Calendar({ events, today, programStart, programEnd }: { events: CalEvent[]; today: string; programStart?: string; programEnd?: string }) {
  const [view, setView] = React.useState<"month" | "week" | "agenda">("month");
  const [cursor, setCursor] = React.useState(today);
  const [filter, setFilter] = React.useState<Set<CalEvent["kind"]>>(new Set());

  // Phones get the agenda by default — a 7-column grid is unreadable at 360px.
  React.useEffect(() => { if (window.matchMedia("(max-width: 640px)").matches) setView("agenda"); }, []);

  const visible = events.filter((e) => filter.size === 0 || filter.has(e.kind));
  const byDate = React.useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of visible) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [visible]);

  const { y, m } = parts(cursor);
  const first = iso(y, m, 1);
  const gridStart = mondayOf(first);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekStart = mondayOf(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const move = (dir: number) => {
    if (view === "month") setCursor(iso(y, m + dir, 1));
    else setCursor(addDays(cursor, dir * (view === "week" ? 7 : 28)));
  };
  const title = view === "month" ? fmt(first, { month: "long", year: "numeric" })
    : view === "week" ? `${fmt(weekDays[0], { day: "numeric", month: "short" })} – ${fmt(weekDays[6], { day: "numeric", month: "short", year: "numeric" })}`
    : `From ${fmt(cursor, { day: "numeric", month: "long" })}`;

  const inProgramme = (d: string) => (!programStart || d >= programStart) && (!programEnd || d <= programEnd);
  const kinds = [...new Set(events.map((e) => e.kind))];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="rounded-lg p-2 hover:bg-[var(--surface-2)]" aria-label="Previous"><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <button type="button" onClick={() => move(1)} className="rounded-lg p-2 hover:bg-[var(--surface-2)]" aria-label="Next"><Icon name="chevronRight" className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCursor(today)} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]">Today</button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold" aria-live="polite">{title}</h2>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5" role="tablist" aria-label="Calendar view">
          {(["month", "week", "agenda"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 text-[12.5px] font-semibold capitalize", view === v ? "bg-[var(--brand)] text-[var(--on-brand)]" : "text-[var(--text-muted)] hover:text-[var(--text)]")}>{v}</button>
          ))}
        </div>
      </div>

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-4 py-2.5" aria-label="Filter events">
          {kinds.map((k) => {
            const on = filter.has(k);
            return (
              <button key={k} type="button" aria-pressed={on}
                onClick={() => setFilter((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold", on ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]")}>
                <Icon name={KIND[k].icon} className="h-3.5 w-3.5" />{KIND[k].label}
              </button>
            );
          })}
          {filter.size > 0 && <button type="button" onClick={() => setFilter(new Set())} className="px-2 text-[12px] font-semibold text-[var(--brand)]">Clear</button>}
        </div>
      )}

      {view === "month" && (
        <div className="table-wrap">
          <div className="grid min-w-[680px] grid-cols-7">
            {DOW.map((d) => <div key={d} className="border-b border-[var(--border)] px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{d}</div>)}
            {monthDays.map((d) => {
              const evs = byDate.get(d) ?? [];
              const outside = parts(d).m !== m;
              return (
                <div key={d} className={cn("min-h-28 border-b border-r border-[var(--border)] p-1.5 [&:nth-child(7n)]:border-r-0", outside && "bg-[var(--surface-2)]/50", !inProgramme(d) && "opacity-60")}>
                  <div className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold", d === today ? "bg-[var(--brand)] text-[var(--on-brand)]" : outside ? "text-[var(--text-subtle)]" : "")}>{parts(d).day}</div>
                  <div className="space-y-1">
                    {evs.slice(0, 3).map((e) => <EventChip key={e.id} e={e} compact />)}
                    {evs.length > 3 && <button type="button" onClick={() => { setCursor(d); setView("agenda"); }} className="px-1 text-[11px] font-semibold text-[var(--brand)]">+{evs.length - 3} more</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid gap-px bg-[var(--border)] sm:grid-cols-7">
          {weekDays.map((d) => (
            <div key={d} className="min-h-40 bg-[var(--surface)] p-2">
              <div className={cn("mb-2 text-[12px] font-bold", d === today && "text-[var(--brand)]")}>{fmt(d, { weekday: "short", day: "numeric" })}</div>
              <div className="space-y-1.5">
                {(byDate.get(d) ?? []).map((e) => <EventChip key={e.id} e={e} />)}
                {!(byDate.get(d) ?? []).length && <p className="text-[12px] text-[var(--text-subtle)]">—</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "agenda" && (() => {
        const upcoming = visible.filter((e) => e.date >= cursor).slice(0, 60);
        const groups = new Map<string, CalEvent[]>();
        for (const e of upcoming) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
        return upcoming.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13.5px] text-[var(--text-muted)]">Nothing scheduled from this date.</p>
        ) : (
          <ol className="divide-y divide-[var(--border)]">
            {[...groups.entries()].map(([d, evs]) => (
              <li key={d} className="flex gap-4 px-4 py-3">
                <div className={cn("w-14 shrink-0 text-center", d === today && "text-[var(--brand)]")}>
                  <div className="text-[11px] font-bold uppercase">{fmt(d, { weekday: "short" })}</div>
                  <div className="text-[20px] font-extrabold leading-tight">{parts(d).day}</div>
                  <div className="text-[11px] text-[var(--text-subtle)]">{fmt(d, { month: "short" })}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">{evs.map((e) => <EventChip key={e.id} e={e} />)}</div>
              </li>
            ))}
          </ol>
        );
      })()}
    </div>
  );
}
