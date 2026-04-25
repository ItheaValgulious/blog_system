import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMarkdownBlockRules,
  createDefaultSlug,
  extractHeadings,
  extractMarkdownBlocks,
  normalizeArticleForSave,
  normalizeAdminHomeConfig,
  normalizeMarkdownBlockConfig,
  renderMarkdown,
  renderMarkdownFragmentWithKatex,
  renderMarkdownWithKatex,
  rewriteRelativeAssetUrls,
  toArticleSummary,
  type ArticleRecord,
  validateEditorConfigShape
} from "./index.js";

test("normalizeArticleForSave fills title from first H1", () => {
  const record = normalizeArticleForSave(
    "notes/example.md",
    `---
tags:
  - one
status: draft
---

# Filled Title

Body`
  );

  assert.equal(record.title, "Filled Title");
  assert.match(record.rawContent, /title: Filled Title/);
});

test("normalizeArticleForSave migrates legacy state to status", () => {
  const record = normalizeArticleForSave(
    "notes/legacy.md",
    `---
state: published
---

# Legacy`
  );

  assert.equal(record.status, "published");
  assert.match(record.rawContent, /status: published/);
  assert.doesNotMatch(record.rawContent, /^state:/m);
});

test("normalizeArticleForSave drops summary frontmatter", () => {
  const record = normalizeArticleForSave(
    "notes/summary.md",
    `---
summary: keep me?
---

# Summary`
  );

  assert.equal(record.summary, undefined);
  assert.doesNotMatch(record.rawContent, /^summary:/m);
});

test("normalizeArticleForSave preserves unquoted yaml dates", () => {
  const record = normalizeArticleForSave(
    "notes/date.md",
    `---
date: 2024-01-02T03:04:05.000Z
---

# Date`
  );

  assert.equal(record.date, "2024-01-02T03:04:05.000Z");
});

test("createDefaultSlug uses title and date", () => {
  assert.equal(createDefaultSlug("Hello World", "2026-04-13T10:00:00.000Z"), "hello-world-2026-04-13");
});

test("toArticleSummary keeps top metadata", () => {
  const record = normalizeArticleForSave(
    "notes/top.md",
    `---
title: Top
status: published
top: 7
---

# Top`
  ) as ArticleRecord;

  assert.equal(toArticleSummary(record).top, 7);
});

test("rewriteRelativeAssetUrls rewrites local asset references", () => {
  const html = `<p><img src="./assets/demo.svg"><a href="notes/file.pdf">file</a></p>`;
  const rewritten = rewriteRelativeAssetUrls(html, "notes", "/content-files");

  assert.match(rewritten, /src="\/content-files\/notes\/\.\/assets\/demo\.svg"/);
  assert.match(rewritten, /href="\/content-files\/notes\/notes\/file\.pdf"/);
});

test("validateEditorConfigShape allows overlapping VS Code style keybindings", () => {
  const result = validateEditorConfigShape({
    snippets: [
      {
        name: "One",
        key: "Ctrl+S",
        body: "test"
      }
    ],
    keybindings: [
      {
        key: "Ctrl+S",
        command: "-workbench.action.quickOpen"
      }
    ]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("renderMarkdown outputs math placeholders for preview", async () => {
  const rendered = await renderMarkdown("Inline $a+b$\n\n$$\n\\int_0^1 x dx\n$$");

  assert.match(rendered.html, /class="math-placeholder inline"/);
  assert.match(rendered.html, /class="math-placeholder block"/);
  assert.doesNotMatch(rendered.html, /katex/);
});

test("renderMarkdownWithKatex keeps server-side math rendering", async () => {
  const rendered = await renderMarkdownWithKatex("$a+b$");

  assert.match(rendered.html, /katex/);
});

test("extractMarkdownBlocks returns top-level markdown ranges", () => {
  const markdown = ["# Title", "", "Paragraph one.", "", "$$", "x+y", "$$"].join("\n");
  const blocks = extractMarkdownBlocks(markdown);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].startLine, 1);
  assert.equal(blocks[0].endLine, 1);
  assert.equal(blocks[1].startLine, 3);
  assert.equal(blocks[1].endLine, 3);
  assert.equal(blocks[2].startLine, 5);
  assert.match(blocks[2].source, /\$\$/);
});

test("extractHeadings includes source line numbers and ignores code fences", () => {
  const markdown = ["# Intro", "", "```md", "# Ignored", "```", "", "Section", "---", "", "## Deep"].join("\n");
  const headings = extractHeadings(markdown);

  assert.deepEqual(
    headings.map((heading) => ({
      depth: heading.depth,
      text: heading.text,
      lineNumber: heading.lineNumber
    })),
    [
      { depth: 1, text: "Intro", lineNumber: 1 },
      { depth: 2, text: "Section", lineNumber: 7 },
      { depth: 2, text: "Deep", lineNumber: 10 }
    ]
  );
});

test("extractMarkdownBlocks keeps paired html containers together", async () => {
  const markdown = ["<div>", "", "asdfasdf", "", "</div>"].join("\n");
  const blocks = extractMarkdownBlocks(markdown);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].startLine, 1);
  assert.equal(blocks[0].endLine, 5);
  assert.equal(blocks[0].source, markdown);

  const html = await renderMarkdownFragmentWithKatex(blocks[0].source);
  assert.match(html, /^<div>\s*<p>asdfasdf<\/p>\s*<\/div>$/);
});

test("extractMarkdownBlocks keeps nested html containers together", () => {
  const markdown = ["<div>", "", "<section>", "", "# hi", "", "</section>", "", "</div>"].join("\n");
  const blocks = extractMarkdownBlocks(markdown);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source, markdown);
});

test("extractMarkdownBlocks keeps paired custom elements together", () => {
  const markdown = ["<x-demo data-mode=\"callout\">", "", "text", "", "</x-demo>"].join("\n");
  const blocks = extractMarkdownBlocks(markdown);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source, markdown);
});

test("extractMarkdownBlocks leaves unmatched and self-closing html nodes unchanged", () => {
  const unmatchedMarkdown = ["<div>", "", "text"].join("\n");
  const unmatchedBlocks = extractMarkdownBlocks(unmatchedMarkdown);

  assert.equal(unmatchedBlocks.length, 2);
  assert.equal(unmatchedBlocks[0].source, "<div>");
  assert.equal(unmatchedBlocks[1].source, "text");

  const selfClosingMarkdown = ["<div />", "", "text"].join("\n");
  const selfClosingBlocks = extractMarkdownBlocks(selfClosingMarkdown);

  assert.equal(selfClosingBlocks.length, 2);
  assert.equal(selfClosingBlocks[0].source, "<div />");
  assert.equal(selfClosingBlocks[1].source, "text");
});

test("renderMarkdownFragmentWithKatex renders math html", async () => {
  const html = await renderMarkdownFragmentWithKatex("$$\\n\\frac{1}{2}\\n$$");

  assert.match(html, /katex/);
});

test("applyMarkdownBlockRules converts nested custom markers into html tags", () => {
  const markdown = [
    "::cbox",
    "outside",
    "::pbox",
    "inside",
    "::/pbox",
    "::/cbox"
  ].join("\n");
  const config = normalizeMarkdownBlockConfig({
    rules: [
      { start: "::cbox", end: "::/cbox", tag: "div", class: ["cbox"] },
      { start: "::pbox", end: "::/pbox", tag: "div", class: ["pbox"] }
    ]
  });

  const output = applyMarkdownBlockRules(markdown, config);

  assert.equal(
    output,
    ["<div class=\"cbox\">", "outside", "<div class=\"pbox\">", "inside", "</div>", "</div>"].join("\n")
  );
});

test("renderMarkdownWithKatex supports bracketed marker syntax", async () => {
  const rendered = await renderMarkdownWithKatex(
    ["[conc]", "", "hello", "", "[/conc]"].join("\n"),
    {
      rules: [
        {
          start: "[conc]",
          end: "[/conc]",
          tag: "div",
          class: ["cbox"]
        }
      ]
    }
  );

  assert.match(rendered.html, /class="cbox"/);
  assert.match(rendered.html, /hello/);
});

test("applyMarkdownBlockRules supports identical start and end markers as toggles", () => {
  const output = applyMarkdownBlockRules(
    ["%%box%%", "inside", "%%box%%"].join("\n"),
    {
      rules: [
        {
          start: "%%box%%",
          end: "%%box%%",
          tag: "div",
          class: ["bbox"]
        }
      ]
    }
  );

  assert.equal(output, ["<div class=\"bbox\">", "inside", "</div>"].join("\n"));
});

test("applyMarkdownBlockRules throws when markers close out of order", () => {
  assert.throws(
    () =>
      applyMarkdownBlockRules(
        ["::cbox", "::/pbox"].join("\n"),
        {
          rules: [
            { start: "::cbox", end: "::/cbox", tag: "div", class: ["cbox"] },
            { start: "::pbox", end: "::/pbox", tag: "div", class: ["pbox"] }
          ]
        }
      ),
    /must close/
  );
});

test("normalizeAdminHomeConfig keeps widget order unique", () => {
  const config = normalizeAdminHomeConfig({
    widgetOrder: ["todo-list", "todo-list", "notes"],
    widgets: {
      "todo-list": {
        items: []
      }
    }
  });

  assert.deepEqual(config.widgetOrder, ["todo-list", "notes"]);
});
