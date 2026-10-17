import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Renders teacher-authored Markdown. Safe to use with dangerouslySetInnerHTML
 * because renderMarkdown escapes all HTML before formatting (see lib/markdown.ts
 * and its tests).
 */
export function Prose({ source, className, small }: { source: string | null | undefined; className?: string; small?: boolean }) {
  const html = renderMarkdown(source);
  if (!html) return null;
  return <div className={cn("prose-dt", small && "prose-sm", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
