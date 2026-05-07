import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveActiveSnippetMatches,
  getMatchingSnippetCompletions,
  getSnippetCompletionReplacementText,
  getSnippetTriggerCharacters
} from "./snippet-completion";
import type { NormalizedSnippet } from "./workbench/types";

function createSnippet(prefix: string | string[]): NormalizedSnippet {
  return {
    body: "",
    environment: "latex",
    name: Array.isArray(prefix) ? prefix.join("-") : prefix,
    prefix: Array.isArray(prefix) ? prefix : [prefix]
  };
}

function createSnippetInEnvironment(
  environment: "markdown" | "latex",
  prefix: string | string[]
): NormalizedSnippet {
  return {
    body: "",
    environment,
    name: `${environment}:${Array.isArray(prefix) ? prefix.join("-") : prefix}`,
    prefix: Array.isArray(prefix) ? prefix : [prefix]
  };
}

test("trigger characters come from the leading symbol run", () => {
  const snippets = [
    createSnippet("\\alpha"),
    createSnippet("::note"),
    createSnippet("frontmatter"),
    createSnippet("a->")
  ];

  assert.deepEqual(getSnippetTriggerCharacters(snippets), ["\\", ":"]);
});

test("mixed symbol and word prefixes keep matching as the user continues typing", () => {
  assert.equal(getSnippetCompletionReplacementText("\\a", "\\alpha"), "\\a");
  assert.equal(getSnippetCompletionReplacementText("value \\alp", "\\alpha"), "\\alp");
  assert.equal(getSnippetCompletionReplacementText("$$", "$$"), "$$");
});

test("word prefixes still require a trailing word match", () => {
  assert.equal(getSnippetCompletionReplacementText("prefixfront", "frontmatter"), "");
  assert.equal(getSnippetCompletionReplacementText("prefix front", "frontmatter"), "front");
});

test("matching completion list becomes empty once no snippet prefix matches", () => {
  const snippets = [createSnippet("\\alpha"), createSnippet("\\beta")];

  assert.equal(getMatchingSnippetCompletions("\\z", snippets).length, 0);
});

test("markdown snippets in progress are carried into latex after dollar flips the context", () => {
  const markdownSnippets = [
    createSnippetInEnvironment("markdown", "$"),
    createSnippetInEnvironment("markdown", "$$")
  ];
  const latexSnippets = [createSnippetInEnvironment("latex", "\\lim")];

  const singleDollar = resolveActiveSnippetMatches("$", "latex", markdownSnippets, latexSnippets);
  assert.deepEqual(
    singleDollar.matches.map((match) => ({ carryOver: match.carryOver, prefix: match.prefix })),
    [{ carryOver: true, prefix: "$" }, { carryOver: true, prefix: "$$" }]
  );

  const doubleDollar = resolveActiveSnippetMatches("$$", "latex", markdownSnippets, latexSnippets);
  assert.deepEqual(
    doubleDollar.matches.map((match) => ({ carryOver: match.carryOver, prefix: match.prefix })),
    [{ carryOver: true, prefix: "$" }, { carryOver: true, prefix: "$$" }]
  );
});

test("markdown carry-over snippets disappear immediately on mismatch inside latex", () => {
  const markdownSnippets = [
    createSnippetInEnvironment("markdown", "$"),
    createSnippetInEnvironment("markdown", "$$")
  ];

  const result = resolveActiveSnippetMatches("$a", "latex", markdownSnippets, []);

  assert.equal(result.matches.length, 0);
});

test("unrelated markdown snippets are not carried into latex unless they are still matching", () => {
  const markdownSnippets = [
    createSnippetInEnvironment("markdown", "frontmatter"),
    createSnippetInEnvironment("markdown", "$$")
  ];

  const result = resolveActiveSnippetMatches("$", "latex", markdownSnippets, []);

  assert.deepEqual(result.matches.map((match) => match.prefix), ["$$"]);
});

test("dollar snippet ordering prefers longer matched text, then shorter prefix length", () => {
  const markdownSnippets = [
    createSnippetInEnvironment("markdown", "$"),
    createSnippetInEnvironment("markdown", "$$")
  ];

  const singleDollar = resolveActiveSnippetMatches("$", "latex", markdownSnippets, []);
  const singleDollarSorted = [...singleDollar.matches].sort((left, right) => {
    if (left.replacementText.length !== right.replacementText.length) {
      return right.replacementText.length - left.replacementText.length;
    }

    if (left.prefix.length !== right.prefix.length) {
      return left.prefix.length - right.prefix.length;
    }

    return left.prefix.localeCompare(right.prefix);
  });
  assert.deepEqual(singleDollarSorted.map((match) => match.prefix), ["$", "$$"]);

  const doubleDollar = resolveActiveSnippetMatches("$$", "latex", markdownSnippets, []);
  const doubleDollarSorted = [...doubleDollar.matches].sort((left, right) => {
    if (left.replacementText.length !== right.replacementText.length) {
      return right.replacementText.length - left.replacementText.length;
    }

    if (left.prefix.length !== right.prefix.length) {
      return left.prefix.length - right.prefix.length;
    }

    return left.prefix.localeCompare(right.prefix);
  });
  assert.deepEqual(doubleDollarSorted.map((match) => match.prefix), ["$$", "$"]);
});
