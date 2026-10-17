"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand";
import { Avatar } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { RoleBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import type { NavItem, NavSection } from "./nav";
import { NotificationBell } from "./notification-bell";

type ShellUser = { firstName: string; lastName: string; email: string; role: "student" | "teacher" | "super_admin" };

function isActive(item: NavItem, pathname: string, search: string): boolean {
  const [path, query] = item.href.split("?");
  if (query) return pathname === path && search.includes(query);
  if (item.exact) return pathname === path && !(path === "/admin/users" && search.includes("role="));
  return pathname === path || pathname.startsWith(`${path}/`);
}

function SideNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <nav className="space-y-5" aria-label="Main">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <div className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7880b5]">{s.title}</div>}
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const active = isActive(item, pathname, search);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors",
                      active ? "bg-[var(--nav-active)] text-[var(--nav-text-strong)]" : "text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text-strong)]",
                    )}
                  >
                    <Icon name={item.icon} className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#f5a524]" : "text-[#8e96c8] group-hover:text-white")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!!item.badge && item.badge > 0 && (
                      <span className="tnum min-w-5 rounded-full bg-[#f5a524] px-1.5 text-center text-[11px] font-bold leading-5 text-[#2b1d00]">{item.badge > 99 ? "99+" : item.badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-[var(--surface-2)]">
        <Avatar firstName={user.firstName} lastName={user.lastName} size={32} />
        <span className="hidden text-[13px] font-semibold sm:block">{user.firstName}</span>
        <Icon name="chevronDown" className="hidden h-3.5 w-3.5 text-[var(--text-subtle)] sm:block" />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--overlay)] shadow-[var(--shadow-overlay)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="truncate text-[14px] font-bold">{user.firstName} {user.lastName}</div>
            <div className="truncate text-[12.5px] text-[var(--text-muted)]">{user.email}</div>
            <div className="mt-2"><RoleBadge role={user.role} /></div>
          </div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-medium hover:bg-[var(--surface-2)]">
            <Icon name="team" className="h-4 w-4 text-[var(--text-subtle)]" /> Profile & password
          </Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] font-medium text-[var(--danger)] hover:bg-[var(--surface-2)]">
              <Icon name="logout" className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, sections, unread, banner, children }: {
  user: ShellUser; sections: NavSection[]; unread: number; banner?: React.ReactNode; children: React.ReactNode;
}) {
  const [drawer, setDrawer] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setDrawer(false), [pathname]);
  React.useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", esc);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = o; };
  }, [drawer]);

  const home = user.role === "super_admin" ? "/admin" : user.role === "teacher" ? "/teach" : "/learn";

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[var(--brand)] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[var(--nav-border)] bg-[var(--nav-bg)] lg:flex">
        <div className="px-5 py-5"><Logo href={home} inverted /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-6"><React.Suspense><SideNav sections={sections} /></React.Suspense></div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="anim-fade fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-72 flex-col bg-[var(--nav-bg)] lg:hidden" aria-label="Menu">
            <div className="flex items-center justify-between px-5 py-5">
              <Logo href={home} inverted />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-lg p-2 text-[#c3c8e6] hover:bg-white/10" aria-label="Close menu"><Icon name="x" className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6"><React.Suspense><SideNav sections={sections} onNavigate={() => setDrawer(false)} /></React.Suspense></div>
          </aside>
        </>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] lg:hidden" aria-label="Open menu" aria-expanded={drawer}>
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <div className="lg:hidden"><Logo href={home} className="[&>span]:hidden sm:[&>span]:block" /></div>
        <div className="flex-1" />
        <NotificationBell initialUnread={unread} />
        <UserMenu user={user} />
      </header>

      {banner}
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
