import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProgressReport } from "@/components/progress-report";
import { buildWeekEvaluations } from "@/server/services/learner";
import { learnerContext, NOT_ENROLLED } from "../data";

export const metadata = { title: "Progress" };

export default async function Progress() {
  const ctx = await learnerContext();
  if (!ctx.program) return <><PageHeader title="Progress" /><Card><EmptyState icon="trend" title="No programme yet" description={NOT_ENROLLED} /></Card></>;
  const evaluations = await buildWeekEvaluations(ctx.user.id, ctx.record, ctx.weeks, ctx.clock.today);
  return (
    <>
      <PageHeader title="Your progress" description={<>Your three-month journey in {ctx.program.name}. <span className="text-[var(--text-subtle)]">Your current standing on each assignment is your latest graded attempt; earlier attempts stay in your history.</span></>} />
      <ProgressReport program={ctx.program} weeks={ctx.weeks} clock={ctx.clock} record={ctx.record} evaluations={evaluations} linkBase="learner" />
    </>
  );
}
