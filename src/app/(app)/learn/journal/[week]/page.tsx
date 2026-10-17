import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/feedback";
import { formatDateOnly, formatDateTime } from "@/lib/utils";
import { JOURNAL_PROMPTS } from "@/server/services/journal";
import { getSettings } from "@/server/services/settings";
import { learnerContext } from "../../data";
import { JournalEditor } from "./editor";

export default async function JournalWeek({ params }: { params: Promise<{ week: string }> }) {
  const { week: n } = await params;
  const ctx = await learnerContext();
  if (!ctx.program) notFound();
  const week = ctx.weeks.find((w) => String(w.weekNumber) === n);
  if (!week) notFound();
  const [entry] = await db.select().from(journalEntries).where(and(eq(journalEntries.studentId, ctx.user.id), eq(journalEntries.weekId, week.id))).limit(1);
  const settings = await getSettings();
  const open = week.startsOn <= ctx.clock.today;
  const prev = ctx.weeks.find((w) => w.weekNumber === week.weekNumber - 1);
  const next = ctx.weeks.find((w) => w.weekNumber === week.weekNumber + 1 && w.startsOn <= ctx.clock.today);

  return (
    <>
      <PageHeader back={{ href: "/learn/journal", label: "Journal" }} eyebrow={`Week ${week.weekNumber} · ${formatDateOnly(week.startsOn, { day: "numeric", month: "short" })} – ${formatDateOnly(week.endsOn, { day: "numeric", month: "short" })}`}
        title={`Reflection: ${week.title}`}
        actions={entry && <Badge tone={entry.status === "submitted" ? "success" : "neutral"}>{entry.status === "submitted" ? `Completed ${formatDateTime(entry.submittedAt, ctx.program.timezone, { day: "numeric", month: "short" })}` : "Private draft"}</Badge>} />
      {!open ? (
        <Notice tone="info" title="This week hasn't started yet">You can write your reflection from {formatDateOnly(week.startsOn, { weekday: "long", day: "numeric", month: "long" })}.</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card><CardBody>
            <JournalEditor weekId={week.id} prompts={JOURNAL_PROMPTS} initial={entry?.responses ?? {}} status={entry?.status ?? null} teacherAccess={settings.teacherJournalAccess} />
          </CardBody></Card>
          <div className="space-y-4 text-[13px]">
            <Card><CardBody className="space-y-2">
              <div className="font-bold">Tips</div>
              <p className="text-[var(--text-muted)]">Be specific: “I can now solve two-step equations” is more useful than “maths went well”.</p>
              <p className="text-[var(--text-muted)]">Your work saves automatically as you type. Mark it complete when you're happy with it.</p>
            </CardBody></Card>
            <div className="flex justify-between">
              {prev ? <Link href={`/learn/journal/${prev.weekNumber}`} className="font-semibold text-[var(--brand)] hover:underline">← Week {prev.weekNumber}</Link> : <span />}
              {next && <Link href={`/learn/journal/${next.weekNumber}`} className="font-semibold text-[var(--brand)] hover:underline">Week {next.weekNumber} →</Link>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
