"use client";

import * as React from "react";

/** A copyable one-time link. The server returns a path; the origin comes from the browser. */
export function ShareLink({ path, label }: { path: string; label: string }) {
  const [origin, setOrigin] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  return (
    <div className="flex gap-2">
      <input readOnly value={url} className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} aria-label={label} />
      <button
        type="button"
        className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-[var(--brand)]"
        onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
