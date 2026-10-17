import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="card w-full max-w-md">
        <EmptyState icon="search" title="We couldn't find that page"
          description="It may have moved, or you may not have access to it."
          action={<ButtonLink href="/">Go home</ButtonLink>} />
      </div>
    </div>
  );
}
