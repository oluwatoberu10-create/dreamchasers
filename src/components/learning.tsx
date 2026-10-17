import Link from "next/link";
import { WorkStatusBadge, TrackDot } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type { WorkItem } from "@/server/services/learner";

/** One assignment row, used on the dashboard, assignments list and planner. */
export function WorkRow({ item, tz, showCourse = true }: { item: WorkItem; tz: string; showCourse?: boolean }) {
  const a = item.assignment;
  const due = a.dueAt;
  const soon = !item.status.isPastDue && due.getTime() - Date.now() < 48 * 3600_000 && item.status.bucket !== "done" && item.status.bucket !== "awaiting_grading";
  return (
    <Link href={`/learn/assignments/${a.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] sm:px-5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", a.kind === "assessment" ? "bg-[var(--star-soft)] text-[var(--star)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}>
        <Icon name={a.kind === "assessment" ? "target" : "edit"} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold group-hover:text-[var(--brand)]">{a.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--text-muted)]">
          {showCourse && <span className="inline-flex items-center gap-1.5"><TrackDot color={item.track.color} />Week {item.week.weekNumber} · {item.course.title}</span>}
          <span className={cn(soon && "font-semibold text-[var(--warning)]", item.status.key === "overdue" && "font-semibold text-[var(--danger)]")}>
            Due {formatDateTime(due, tz)} ({relativeTime(due)})
          </span>
          {item.lastGrade && <span className="tnum font-semibold text-[var(--text)]">{item.lastGrade.score}/{item.lastGrade.maxScore}</span>}
        </span>
      </span>
      <WorkStatusBadge status={item.status.key} />
    </Link>
  );
}
