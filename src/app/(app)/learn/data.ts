import "server-only";
import { cache } from "react";
import { pageStudent } from "@/server/auth";
import { isEnrolled } from "@/server/policy";
import { studentRecord } from "@/server/services/learner";
import { getCurrentProgram, getWeeks, programClock } from "@/server/services/program";

/** Everything a learner page needs, loaded once per request. */
export const learnerContext = cache(async () => {
  const user = await pageStudent();
  const program = await getCurrentProgram();
  if (!program || !(await isEnrolled(user.id, program.id))) return { user, program: null } as const;
  const weeks = await getWeeks(program.id);
  const clock = programClock(program, weeks);
  const record = await studentRecord(user.id, program, weeks);
  return { user, program, weeks, clock, record } as const;
});

export const NOT_ENROLLED =
  "You're not enrolled in an active programme yet. When the next cohort opens, its courses will appear here automatically — or ask an administrator to add you.";
