import assert from "node:assert/strict";
import test from "node:test";

import { extractMarkdownOutline, findActiveMarkdownOutlineItemId } from "./markdown-outline";

test("extractMarkdownOutline offsets frontmatter lines and nests headings", () => {
  const rawContent = [
    "---",
    "title: Demo",
    "---",
    "",
    "# Intro",
    "",
    "```md",
    "# Ignored",
    "```",
    "",
    "Section",
    "---",
    "",
    "## Deep"
  ].join("\n");

  const outline = extractMarkdownOutline("notes/demo.md", rawContent);

  assert.equal(outline.length, 1);
  assert.equal(outline[0].text, "Intro");
  assert.equal(outline[0].lineNumber, 5);
  assert.equal(outline[0].children.length, 2);
  assert.equal(outline[0].children[0].text, "Section");
  assert.equal(outline[0].children[0].lineNumber, 11);
  assert.equal(outline[0].children[1].text, "Deep");
  assert.equal(outline[0].children[1].lineNumber, 14);
});

test("findActiveMarkdownOutlineItemId returns the closest heading above the cursor", () => {
  const outline = extractMarkdownOutline(
    "notes/demo.md",
    ["# Intro", "", "## Setup", "", "## Usage", "", "### Detail"].join("\n")
  );

  assert.equal(findActiveMarkdownOutlineItemId(outline, 1), outline[0].id);
  assert.equal(findActiveMarkdownOutlineItemId(outline, 4), outline[0].children[0].id);
  assert.equal(findActiveMarkdownOutlineItemId(outline, 7), outline[0].children[1].children[0].id);
});
