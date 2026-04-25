import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesEditorAssociationPattern,
  resolvePreferredEditorId
} from "./editor-associations";

import type {
  EditorContributionDefinition,
  WorkbenchDocument
} from "./types";

const NullComponent: EditorContributionDefinition["component"] = () => null;

function createArticleDocument(articlePath: string): WorkbenchDocument {
  return {
    articlePath,
    dirty: false,
    editorId: "workbench.article-markdown",
    id: `article:${articlePath}`,
    kind: "article",
    language: "markdown",
    previewable: true,
    record: {} as never,
    savedValue: "# Demo\n",
    title: articlePath,
    value: "# Demo\n"
  };
}

test("matchesEditorAssociationPattern supports exact, extension, and glob patterns", () => {
  assert.equal(matchesEditorAssociationPattern("notes/demo.md", "/notes/demo.md"), true);
  assert.equal(matchesEditorAssociationPattern("*.md", "notes/demo.md"), true);
  assert.equal(matchesEditorAssociationPattern("config/*.json", "config/editor.associations.json"), true);
  assert.equal(matchesEditorAssociationPattern("config/*.json", "notes/demo.md"), false);
});

test("resolvePreferredEditorId prefers configured editor association when available", () => {
  const document = createArticleDocument("notes/demo.md");
  const editors: EditorContributionDefinition[] = [
    {
      canHandle: (candidate) => candidate.kind === "article",
      component: NullComponent,
      editorId: "workbench.article-markdown",
      label: "Article Markdown",
      matches: (candidate) => candidate.kind === "article"
    },
    {
      canHandle: (candidate) => candidate.kind === "article",
      component: NullComponent,
      editorId: "workbench.code-text",
      label: "Code Text"
    }
  ];

  assert.equal(
    resolvePreferredEditorId(document, editors, {
      "*.md": "workbench.code-text"
    }),
    "workbench.code-text"
  );
});

test("resolvePreferredEditorId falls back to editor matches when no association applies", () => {
  const document = createArticleDocument("notes/demo.md");
  const editors: EditorContributionDefinition[] = [
    {
      canHandle: (candidate) => candidate.kind === "article",
      component: NullComponent,
      editorId: "workbench.article-markdown",
      label: "Article Markdown",
      matches: (candidate) => candidate.kind === "article"
    },
    {
      canHandle: (candidate) => candidate.kind === "article",
      component: NullComponent,
      editorId: "workbench.code-text",
      label: "Code Text"
    }
  ];

  assert.equal(resolvePreferredEditorId(document, editors, {}), "workbench.article-markdown");
});
