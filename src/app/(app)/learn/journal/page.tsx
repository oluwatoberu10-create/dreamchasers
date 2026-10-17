import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, ProgressBar } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { formatDateOnly, formatDateTime, truncate } from "@/lib/utils";
import { journalHistory } from "@/server/services/journal";
import { getSettings } from "@/server/services/settings";
import { learnerContext, NOT_ENROLLED } from "../data";

export const metadata = { title: "Journal" };

export default async function JournalOverview() {
  const ctx = await learnerContext();
  if (!ctx.program) return <><PageHeader title="Journal" /><Card><EmptyState icon="journal" title="No programme yet" description={NOT_ENROLLED} /></Card></>;
  const [entries, settings] = await Promise.all([journalHistory(ctx.user.id, ctx.program.id), getSettings()]);
  const started = ctx.weeks.filter((w) => w.startsOn <= ctx.clock.today);
  const completed = entries.filter((e) => e.entry.status === "submitted").length;

  return (
    <>
      <PageHeader title="Weekly journal" description="A private space to reflect on what you learned, what was hard, and what you'll aim for next."
        actions={ctx.clock.currentWeek && <Link href={`/learn/journal/${ctx.clock.currentWeek.weekNumber}`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-field)] bg-[var(--star-strong)] px-4 text-sm font-semibold text-[#2b1d00]"><Icon name="edit" className="h-4 w-4" />Write this week</Link>} />

      <div className="mb-6">
        <Notice tone="brand" icon="lock" title="Who can read your journal">
          Drafts are visible only to you. {settings.teacherJournalAccess
            ? "When you mark a reflection as complete, your teachers can read it so they can support you. Nobody else in the community can."
            : "Completed reflections are private to you as well — teachers can't read them on this platform."}
        </Notice>
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-2 flex justify-between text-[13px] font-semibold"><span>Reflections completed</span><span className="tnum">{completed} of {started.length} weeks so far</span></div>
        <ProgressBar value={completed} max={Math.max(1, started.length)} tone="star" label="Reflections completed" />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ctx.weeks.map((w) => {
          const e = entries.find((x) => x.week.id === w.id)?.entry;
          const open = w.startsOn <= ctx.clock.today;
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">Week {w.weekNumber}</span>
                {e ? <Badge tone={e.status === "submitted" ? "success" : "neutral"}>{e.status === "submitted" ? "Completed" : "Private draft"}</Badge> : open ? <Badge tone="warning">Not written</Badge> : <Badge>Opens {formatDateOnly(w.startsOn, { day: "numeric", month: "short" })}</Badge>}
              </div>
              <div className="mt-1.5 text-[15px] font-bold">{w.title}</div>
              <p className="mt-1.5 line-clamp-3 text-[13px] text-[var(--text-muted)]">{e?.responses.learned ? truncate(e.responses.learned, 160) : open ? "What did you learn this week?" : "You can write about this week once it starts."}</p>
              {e && <p className="mt-3 text-[11.5px] text-[var(--text-subtle)]">Updated {formatDateTime(e.updatedAt, ctx.program!.timezone)}</p>}
            </>
          );
          return open
            ? <Link key={w.id} href={`/learn/journal/${w.weekNumber}`} className="card lift block p-5">{body}</Link>
            : <div key={w.id} className="rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-5 opacity-70">{body}</div>;
        })}
      </div>
    </>
  );
}
