"use client";

import { renderMarkdown } from "@/lib/markdown";

/** Client-side preview using the same escaping renderer the server uses. */
export function MarkdownPreview({ source }: { source: string }) {
  const html = renderMarkdown(source);
  return html ? <div className="prose-dt" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-[13px] text-[var(--text-subtle)]">Nothing to preview yet.</p>;
}
