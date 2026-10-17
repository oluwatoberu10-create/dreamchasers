import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_META, type StatusKey, type Tone } from "@/lib/status";
import { LEARNING_STATUS_LABEL, WEEK_RESULT_LABEL, type LearningStatus, type WeekResult } from "@/lib/progress";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]",
  brand: "bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand-border)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/25",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/25",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/25",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/25",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", tones[tone], className)} {...props} />;
}

/** Assignment status, from the single source of truth in lib/status.ts. */
export function WorkStatusBadge({ status }: { status: StatusKey }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone} title={m.hint}>{m.label}</Badge>;
}

const COURSE_TONE: Record<string, Tone> = { draft: "neutral", scheduled: "info", published: "success", archived: "neutral" };
const COURSE_LABEL: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", published: "Published", archived: "Archived" };

export function CourseStatusBadge({ status, publishAt }: { status: string; publishAt?: Date | null }) {
  // A scheduled course whose time has passed is live, even if the job has not flipped it yet.
  const live = status === "scheduled" && publishAt && publishAt <= new Date();
  return <Badge tone={live ? "success" : COURSE_TONE[status] ?? "neutral"}>{live ? "Published" : COURSE_LABEL[status] ?? status}</Badge>;
}

export function RoleBadge({ role }: { role: "student" | "teacher" | "super_admin" }) {
  const cfg = { student: ["Learner", "neutral"], teacher: ["Teacher", "brand"], super_admin: ["Super admin", "warning"] }[role] as [string, Tone];
  return <Badge tone={cfg[1]}>{cfg[0]}</Badge>;
}

export function WeekResultBadge({ result }: { result: WeekResult }) {
  const tone: Record<WeekResult, Tone> = { no_assessed_work: "neutral", awaiting_evaluation: "brand", passed: "success", not_passed: "warning", outstanding: "danger" };
  return <Badge tone={tone[result]}>{WEEK_RESULT_LABEL[result]}</Badge>;
}

export function LearningStatusBadge({ status }: { status: LearningStatus }) {
  const tone: Record<LearningStatus, Tone> = { not_started: "neutral", in_progress: "info", completed: "success", needs_revision: "warning" };
  return <Badge tone={tone[status]}>{LEARNING_STATUS_LABEL[status]}</Badge>;
}

export function TrackDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: color }} aria-hidden />;
}
