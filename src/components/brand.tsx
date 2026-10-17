import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Dream Chasers mark: an open book with a star rising from it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#3f4fd8" />
      <path d="M7 21.5c3-1.6 6-1.6 9 0 3-1.6 6-1.6 9 0V12c-3-1.6-6-1.6-9 0-3-1.6-6-1.6-9 0v9.5Z" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 12v9.5" stroke="#fff" strokeWidth="1.7" />
      <path d="m16 4.2 1.1 2.3 2.5.4-1.8 1.7.4 2.5L16 9.9l-2.2 1.2.4-2.5-1.8-1.7 2.5-.4L16 4.2Z" fill="#f5a524" />
    </svg>
  );
}

export function Logo({ href = "/", inverted = false, className }: { href?: string; inverted?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="Dream Chasers Community home">
      <LogoMark />
      <span className={cn("leading-none", inverted ? "text-white" : "text-[var(--text)]")}>
        <span className="block text-[15px] font-extrabold tracking-tight">Dream Chasers</span>
        <span className={cn("block text-[10.5px] font-semibold uppercase tracking-[0.14em]", inverted ? "text-[#aab2e6]" : "text-[var(--text-subtle)]")}>Community</span>
      </span>
    </Link>
  );
}
