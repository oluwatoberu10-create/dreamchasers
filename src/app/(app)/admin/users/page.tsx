import Link from "next/link";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, trackTeachers, tracks, users } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Avatar, EmptyState, Notice } from "@/components/ui/feedback";
import { cn, formatDateTime } from "@/lib/utils";
import { adminContext } from "../data";
import { CreateUser } from "./create-user";

export const metadata = { title: "Users" };

const ROLES = [{ key: "", label: "All roles" }, { key: "student", label: "Learners" }, { key: "teacher", label: "Teachers" }, { key: "super_admin", label: "Super admins" }];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; deleted?: string }> }) {
  const ctx = await adminContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const role = ["student", "teacher", "super_admin"].includes(sp.role ?? "") ? (sp.role as "student" | "teacher" | "super_admin") : null;
  const status = sp.status === "deactivated" ? "deactivated" : sp.status === "active" ? "active" : null;

  const conds: SQL[] = [];
  if (q) conds.push(sql`(${users.firstName} || ' ' || ${users.lastName} || ' ' || ${users.email}) ilike ${"%" + q.replace(/[%_]/g, "\\$&") + "%"}`);
  if (role) conds.push(eq(users.role, role));
  if (status) conds.push(eq(users.status, status));

  const programId = ctx.program?.id ?? "00000000-0000-0000-0000-000000000000";
  const rows = await db.select({
    u: users,
    enrolled: sql<boolean>`exists (select 1 from ${enrollments} e where e.student_id = ${users.id} and e.program_id = ${programId})`,
    teaches: sql<string | null>`(select string_agg(t.name, ', ' order by t.name) from ${trackTeachers} tt join ${tracks} t on t.id = tt.track_id where tt.teacher_id = ${users.id} and t.program_id = ${programId})`,
  }).from(users).where(conds.length ? and(...conds) : undefined).orderBy(desc(users.createdAt), asc(users.lastName)).limit(300);

  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}) });
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };
  const title = role === "teacher" ? "Teachers" : role === "student" ? "Students" : role === "super_admin" ? "Super admins" : "Users";

  return (
    <>
      <PageHeader title={title} description="Manage accounts, roles and access. Accounts with learning records are deactivated rather than deleted." actions={<CreateUser />} />
      {sp.deleted && <div className="mb-4"><Notice tone="success">Account deleted.</Notice></div>}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form className="flex-1" role="search">
          {role && <input type="hidden" name="role" value={role} />}
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Search name or email…" aria-label="Search users"
            className="h-10 w-full max-w-sm rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20" />
        </form>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => <Link key={r.key} href={link({ role: r.key || null })} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", (role ?? "") === r.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{r.label}</Link>)}
          <span className="mx-1 w-px bg-[var(--border)]" />
          {[{ k: null, l: "Any status" }, { k: "active", l: "Active" }, { k: "deactivated", l: "Deactivated" }].map((s) => (
            <Link key={s.l} href={link({ status: s.k })} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", status === s.k ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{s.l}</Link>
          ))}
        </div>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon="users" title="No users match" /> : (
          <div className="table-wrap">
            <table className="table-dt min-w-[820px]">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Teaching / learning</th><th>Added</th></tr></thead>
              <tbody>
                {rows.map(({ u, enrolled, teaches }) => (
                  <tr key={u.id}>
                    <td><Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 font-semibold hover:text-[var(--brand)]"><Avatar firstName={u.firstName} lastName={u.lastName} size={30} />{u.firstName} {u.lastName}</Link></td>
                    <td className="text-[13px] text-[var(--text-muted)]">{u.email}</td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>{u.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                    <td className="text-[13px]">{u.role === "student" ? (enrolled ? "Enrolled in current programme" : <span className="text-[var(--warning)]">Not enrolled</span>) : teaches ?? <span className="text-[var(--text-subtle)]">No track</span>}</td>
                    <td className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">{formatDateTime(u.createdAt, ctx.program?.timezone ?? "UTC", { day: "numeric", month: "short", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
