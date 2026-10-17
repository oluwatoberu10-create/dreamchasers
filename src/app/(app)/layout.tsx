import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, submissions } from "@/db/schema";
import { AppShell } from "@/components/shell/app-shell";
import { navFor } from "@/components/shell/nav";
import { canTeach, pageUser } from "@/server/auth";
import { managedCoursesWhere } from "@/server/policy";
import { maybeRunJobs } from "@/server/services/jobs";
import { unreadMessageCount } from "@/server/services/messaging";
import { unreadCount } from "@/server/services/notifications";
import { getCurrentProgram } from "@/server/services/program";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const program = await getCurrentProgram();

  const [notifications, messages, toGrade] = await Promise.all([
    unreadCount(user.id),
    unreadMessageCount(user.id),
    canTeach(user) && program
      ? db.select({ n: sql<number>`count(*)::int` }).from(submissions)
        .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
        .innerJoin(courses, eq(courses.id, assignments.courseId))
        .where(and(eq(submissions.status, "submitted"), eq(courses.programId, program.id), managedCoursesWhere(user)))
        .then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
  ]);

  // Background jobs (publishing, reminders, deadlines). Runs after the response
  // is sent, so it never slows the page (see services/jobs.ts).
  after(() => maybeRunJobs());

  return (
    <AppShell
      user={{ firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role }}
      sections={navFor(user.role, { notifications, messages, toGrade })}
      unread={notifications}
    >
      {children}
    </AppShell>
  );
}
