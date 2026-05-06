import assert from "node:assert/strict";
import test from "node:test";

import { extractMarkdownBlocks, renderMarkdownFragmentWithKatex } from "./markdown.js";

test("renderMarkdownFragmentWithKatex stays responsive for unfinished inline math", async () => {
  const source = `${Array.from({ length: 240 }, (_, index) => `line ${index}`).join("\n")}\n$`;
  const html = await Promise.race([
    renderMarkdownFragmentWithKatex(source),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("render timed out")), 2000);
    })
  ]);

  assert.match(html, /\$/);
});

test("extractMarkdownBlocks stays responsive for unfinished inline math", () => {
  const source = `${Array.from({ length: 240 }, (_, index) => `line ${index}`).join("\n")}\n$`;
  const blocks = extractMarkdownBlocks(source);

  assert.ok(blocks.length > 0);
});
