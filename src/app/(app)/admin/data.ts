import "server-only";
import { cache } from "react";
import { pageAdmin } from "@/server/auth";
import { getCurrentProgram, getWeeks, programClock } from "@/server/services/program";

export const adminContext = cache(async () => {
  const user = await pageAdmin();
  const program = await getCurrentProgram();
  if (!program) return { user, program: null } as const;
  const weeks = await getWeeks(program.id);
  return { user, program, weeks, clock: programClock(program, weeks) } as const;
});
