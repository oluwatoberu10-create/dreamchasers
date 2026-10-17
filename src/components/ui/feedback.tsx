import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

export function Avatar({ firstName, lastName, size = 36, className }: { firstName: string; lastName: string; size?: number; className?: string }) {
  const label = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  // Deterministic hue per person so the same learner keeps the same colour.
  const hue = ([...`${firstName}${lastName}`].reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 28%)` }}
      aria-hidden
    >
      {label}
    </span>
  );
}

export function EmptyState({ title, description, action, icon = "inbox", compact }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: IconName; compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-14")}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, icon }: { tone?: "info" | "warning" | "success" | "danger" | "brand"; title?: React.ReactNode; children?: React.ReactNode; icon?: IconName }) {
  const cls = {
    info: "border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info)]",
    warning: "border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--warning)]",
    success: "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]",
    danger: "border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger)]",
    brand: "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]",
  }[tone];
  const ic: IconName = icon ?? (tone === "success" ? "checkCircle" : tone === "info" || tone === "brand" ? "bell" : "alert");
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius-field)] border px-4 py-3 text-[13.5px]", cls)} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={ic} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-bold">{title}</div>}
        {children && <div className={cn("text-[var(--text)]", Boolean(title) && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = "brand", className, label }: {
  value: number; max?: number; tone?: "brand" | "success" | "warning" | "danger" | "star"; className?: string; label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const color = { brand: "var(--brand)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", star: "var(--star-strong)" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full origin-left rounded-full" style={{ width: `${pct}%`, background: color, animation: "dt-fill 700ms var(--ease-out-soft) both" }} />
    </div>
  );
}

/** Circular progress, e.g. "week 5 of 12". */
export function ProgressRing({ value, max, size = 76, stroke = 8, label, sublabel }: { value: number; max: number; size?: number; stroke?: number; label: React.ReactNode; sublabel?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${value} of ${max}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--star-strong)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 700ms var(--ease-out-soft)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="text-[17px] font-extrabold">{label}</span>
        {sublabel && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[var(--radius-field)]", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-72" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card p-5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-4 h-7 w-14" /></div>)}
      </div>
      <div className="card space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
    </div>
  );
}
