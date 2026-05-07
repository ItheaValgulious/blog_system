import assert from "node:assert/strict";
import test from "node:test";

import {
  parseStoredCollapsedTreePaths,
  parseStoredWorkbenchResource,
  remapCollapsedTreePaths,
  removeCollapsedTreePaths,
  serializeCollapsedTreePaths,
  serializeWorkbenchResource
} from "./workbench-session";
import type { WorkbenchDocument } from "./workbench/types";

test("serializeWorkbenchResource captures supported document identities", () => {
  const document = {
    dirty: false,
    editorId: "project.task-markdown",
    kind: "projectTask",
    language: "markdown",
    previewable: false,
    projectId: "proj-a",
    record: { id: "task-1", title: "Task 1" },
    savedValue: "",
    taskId: "task-1",
    title: "Task 1",
    value: ""
  } as unknown as WorkbenchDocument;

  assert.deepEqual(serializeWorkbenchResource(document), {
    kind: "projectTask",
    preferredEditorId: "project.task-markdown",
    projectId: "proj-a",
    taskId: "task-1"
  });
});

test("serializeWorkbenchResource maps theme group config documents to dedicated targets", () => {
  const document = {
    dirty: false,
    editorId: "workbench.code-text",
    fileName: "theme.json",
    groupId: "atlas",
    kind: "themeAsset",
    language: "json",
    previewable: false,
    savedValue: "",
    title: "theme.json",
    value: ""
  } as unknown as WorkbenchDocument;

  assert.deepEqual(serializeWorkbenchResource(document), {
    groupId: "atlas",
    kind: "themeGroupConfig",
    preferredEditorId: "workbench.code-text"
  });
});

test("parseStoredWorkbenchResource rejects malformed payloads", () => {
  assert.equal(parseStoredWorkbenchResource(null), null);
  assert.equal(parseStoredWorkbenchResource("{"), null);
  assert.equal(
    parseStoredWorkbenchResource(JSON.stringify({ kind: "projectTask", projectId: "proj-a" })),
    null
  );
  assert.equal(
    parseStoredWorkbenchResource(JSON.stringify({ kind: "config", configKind: "nope" })),
    null
  );
});

test("parseStoredWorkbenchResource restores persisted targets", () => {
  assert.deepEqual(
    parseStoredWorkbenchResource(
      JSON.stringify({
        articlePath: "notes/test.md",
        kind: "article",
        preferredEditorId: "workbench.article-markdown"
      })
    ),
    {
      articlePath: "notes/test.md",
      kind: "article",
      preferredEditorId: "workbench.article-markdown"
    }
  );
});

test("collapsed tree path storage normalizes parsed arrays", () => {
  assert.deepEqual(
    [...parseStoredCollapsedTreePaths(JSON.stringify(["b", 1, "a", "", "a"]))],
    ["b", "a"]
  );
  assert.deepEqual(
    serializeCollapsedTreePaths(["notes/z", "notes/a", "notes/a"]),
    JSON.stringify(["notes/a", "notes/z"])
  );
});

test("collapsed tree paths remap and remove nested directories", () => {
  const current = new Set(["notes", "notes/drafts", "projects/demo"]);

  assert.deepEqual(
    [...remapCollapsedTreePaths(current, "notes", "archive/notes")].sort(),
    ["archive/notes", "archive/notes/drafts", "projects/demo"]
  );
  assert.deepEqual(
    [...removeCollapsedTreePaths(current, "notes")].sort(),
    ["projects/demo"]
  );
});
