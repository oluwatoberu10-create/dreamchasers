import { describe, expect, it } from "vitest";
import { renderMarkdown, safeHref } from "./markdown";

describe("renderMarkdown", () => {
  it("escapes any HTML a teacher types", () => {
    const out = renderMarkdown('<script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("drops dangerous link schemes but keeps the label", () => {
    expect(renderMarkdown("[click](javascript:void)")).toBe("<p>click</p>");
    expect(renderMarkdown("[click](javascript:alert(1))")).not.toContain("<a");
    expect(renderMarkdown("[x](data:text/html;base64,AAAA)")).toBe("<p>x</p>");
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("renders the supported subset", () => {
    expect(renderMarkdown("# Title")).toBe("<h2>Title</h2>");
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(renderMarkdown("**bold** and *it*")).toBe("<p><strong>bold</strong> and <em>it</em></p>");
    expect(renderMarkdown("use `x < y`")).toBe("<p>use <code>x &lt; y</code></p>");
    expect(renderMarkdown("[site](https://example.com/a_b_c)")).toBe(
      '<p><a href="https://example.com/a_b_c" target="_blank" rel="noopener noreferrer nofollow">site</a></p>',
    );
  });

  it("does not let attribute quotes break out of an href", () => {
    const out = renderMarkdown('[x](https://e.com/"onmouseover="alert(1))');
    expect(out).not.toMatch(/"\s*onmouseover=/);
  });
});
