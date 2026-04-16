import assert from "node:assert/strict";
import test from "node:test";

import { getSnippetsForLanguage, normalizeWorkbenchSnippets } from "./snippet-scope";

test("latex snippets only apply inside latex environment by default", () => {
  const snippets = normalizeWorkbenchSnippets(
    [
      {
        name: "divide",
        prefix: "\\frac",
        body: "\\dfrac{$1}{$2}"
      }
    ],
    "latex"
  );

  assert.equal(getSnippetsForLanguage(snippets, "latex").length, 1);
  assert.equal(getSnippetsForLanguage(snippets, "markdown").length, 0);
});

test("markdown snippets only apply outside math environment by default", () => {
  const snippets = normalizeWorkbenchSnippets(
    [
      {
        name: "frontmatter",
        prefix: "frontmatter",
        body: "---\n$0"
      }
    ],
    "markdown"
  );

  assert.equal(getSnippetsForLanguage(snippets, "markdown").length, 1);
  assert.equal(getSnippetsForLanguage(snippets, "latex").length, 0);
});

test("snippet scope further restricts snippets within their own environment", () => {
  const snippets = normalizeWorkbenchSnippets(
    [
      {
        name: "markdown-only",
        scope: "markdown",
        prefix: "frontmatter",
        body: "---\n$0"
      }
    ],
    "latex"
  );

  assert.equal(getSnippetsForLanguage(snippets, "latex").length, 0);
  assert.equal(getSnippetsForLanguage(snippets, "markdown").length, 0);
});
