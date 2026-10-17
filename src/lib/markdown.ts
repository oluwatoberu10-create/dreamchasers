/**
 * A deliberately small Markdown renderer for lesson content, assignment
 * instructions and feedback.
 *
 * Safety model: the source is HTML-escaped FIRST, so no tag a teacher types can
 * ever reach the page. Formatting is then applied to the escaped text, and the
 * only attribute we ever emit is an href that has passed `safeHref`.
 *
 * Supported: # / ## / ### headings, paragraphs, - and 1. lists, > quotes,
 * ``` code blocks, --- rules, **bold**, *italic*, `code`, [links](https://…).
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only web, mail and same-site links. Rejects javascript:, data:, vbscript: etc. */
export function safeHref(raw: string): string | null {
  // `raw` is already HTML-escaped; undo the one entity that legitimately
  // appears in URLs so the check sees the real scheme.
  const url = raw.replace(/&amp;/g, "&").trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("#")) return url;
  return null;
}

function inline(text: string): string {
  // Code spans and links are swapped for placeholders first, so emphasis rules
  // can never reach inside a code span or an href.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;

  let out = text.replace(/`([^`]+)`/g, (_, c: string) => hold(`<code>${c}</code>`));

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const safe = safeHref(href);
    if (!safe) return label;
    const external = /^https?:/i.test(safe);
    return hold(`<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${label}</a>`);
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return "";
  const lines = escapeHtml(source.replace(/\r\n?/g, "\n")).split("\n");
  const html: string[] = [];
  let i = 0;

  const isBlockStart = (l: string) =>
    /^(#{1,3})\s/.test(l) || /^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) ||
    /^&gt;\s?/.test(l) || /^```/.test(l) || /^---+\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      html.push(`<pre><code>${body.join("\n")}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length + 1; // # → h2; the page owns h1
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) { html.push("<hr />"); i++; continue; }

    if (/^&gt;\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) body.push(lines[i++].replace(/^&gt;\s?/, ""));
      html.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(re, ""))}</li>`);
      html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) para.push(lines[i++]);
    html.push(`<p>${inline(para.join("<br />"))}</p>`);
  }

  return html.join("\n");
}
