"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card">
      <EmptyState
        icon="alert"
        title="This page couldn't load"
        description={<>Something went wrong on our side. Try again — if it keeps happening, let an administrator know{error.digest ? <> (reference <code>{error.digest}</code>)</> : null}.</>}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
