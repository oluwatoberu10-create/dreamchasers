import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text-subtle)]", className)} {...props} />;
}

/**
 * Metric tile. `definition` is shown on hover/focus so every number on an
 * analytics screen explains exactly what it counts.
 */
export function StatCard({ label, value, hint, definition, href, tone = "default", icon, delay = 0 }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; definition?: string; href?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand"; icon?: IconName; delay?: number;
}) {
  const toneClass = {
    default: "text-[var(--text-subtle)] bg-[var(--surface-2)]",
    brand: "text-[var(--brand)] bg-[var(--brand-soft)]",
    success: "text-[var(--success)] bg-[var(--success-soft)]",
    warning: "text-[var(--warning)] bg-[var(--warning-soft)]",
    danger: "text-[var(--danger)] bg-[var(--danger-soft)]",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]" title={definition}>
          {label}
          {definition && <span className="sr-only">. {definition}</span>}
        </span>
        {icon && <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClass)}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <div className="tnum mt-2 text-[26px] font-bold leading-none tracking-tight">{value}</div>
      {hint && <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">{hint}</p>}
    </>
  );
  const cls = cn("card anim-rise block p-4 sm:p-5", href && "lift");
  const style = delay ? ({ "--stagger": `${delay}ms` } as React.CSSProperties) : undefined;
  return href ? <Link href={href} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}

export function PageHeader({ title, description, eyebrow, actions, back }: {
  title: React.ReactNode; description?: React.ReactNode; eyebrow?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--brand)]">{eyebrow}</div>}
          <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[14px] text-[var(--text-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
