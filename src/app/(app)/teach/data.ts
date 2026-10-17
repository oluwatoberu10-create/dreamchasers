import "server-only";
import { cache } from "react";
import { pageTeacher } from "@/server/auth";
import { getCurrentProgram, getTracks, getWeeks, programClock, teacherTracks } from "@/server/services/program";

export const teacherContext = cache(async () => {
  const user = await pageTeacher();
  const program = await getCurrentProgram();
  if (!program) return { user, program: null } as const;
  const [weeks, tracks] = await Promise.all([
    getWeeks(program.id),
    user.role === "super_admin" ? getTracks(program.id) : teacherTracks(user.id, program.id),
  ]);
  return { user, program, weeks, tracks, clock: programClock(program, weeks) } as const;
});

export const NO_PROGRAM = "There is no current programme yet. A super admin can create one under Settings.";
