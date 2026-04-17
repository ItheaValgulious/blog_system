import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import request from "supertest";

import { createApp } from "./app.js";

async function setupTempApp() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-server-"));
  const assetsRoot = path.join(tempRoot, "assets");
  const configRoot = path.join(tempRoot, "config");
  const contentRoot = path.join(tempRoot, "content");
  const editorConfigDir = path.join(configRoot, "editor");
  await fs.mkdir(path.join(contentRoot, "notes"), { recursive: true });
  await fs.mkdir(assetsRoot, { recursive: true });
  await fs.mkdir(editorConfigDir, { recursive: true });

  await fs.writeFile(
    path.join(contentRoot, "notes", "draft.md"),
    `---
title: Draft Note
tags: [draft]
status: draft
---

# Draft Note
`,
    "utf8"
  );
  await fs.writeFile(path.join(editorConfigDir, "snippets.json"), "[]\n", "utf8");
  await fs.writeFile(path.join(editorConfigDir, "keybindings.json"), "[]\n", "utf8");

  const app = createApp({
    contentRoot,
    editorConfigDir,
    adminUsername: "admin",
    adminPassword: "secret",
    sessionSecret: "test-secret",
    adminDistDir: tempRoot,
    siteDistDir: tempRoot,
    port: 0,
    npmCommand: process.platform === "win32" ? "npm.cmd" : "npm",
    projectRoot: tempRoot,
    workspaceRoot: tempRoot,
    configRoot,
    assetsRoot
  });
  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  return { tempRoot, assetsRoot, contentRoot, agent };
}

test("save endpoint fills missing title from first heading", async () => {
  const { agent } = await setupTempApp();
  const response = await agent
    .put("/api/article")
    .send({
      path: "notes/new-entry.md",
      rawContent: `---
tags: [one]
status: draft
---

# Auto Title
`
    })
    .expect(200);

  assert.equal(response.body.title, "Auto Title");
  assert.match(response.body.rawContent, /title: Auto Title/);
});

test("publishing a draft writes the publish date", async () => {
  const { agent } = await setupTempApp();
  const response = await agent
    .post("/api/article/status")
    .send({
      path: "notes/draft.md",
      status: "published"
    })
    .expect(200);

  assert.equal(response.body.status, "published");
  assert.match(response.body.date, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(response.body.rawContent, /^status: published/m);
});

test("publishing keeps an existing date unchanged", async () => {
  const { agent, contentRoot } = await setupTempApp();
  const existingDate = "2024-01-02T03:04:05.000Z";
  await fs.writeFile(
    path.join(contentRoot, "notes", "dated-draft.md"),
    `---
title: Dated Draft
status: draft
date: ${existingDate}
---

# Dated Draft
`,
    "utf8"
  );

  const response = await agent
    .post("/api/article/status")
    .send({
      path: "notes/dated-draft.md",
      status: "published"
    })
    .expect(200);

  assert.equal(response.body.date, existingDate);
  assert.match(response.body.rawContent, /^date:/m);
  assert.match(response.body.rawContent, new RegExp(existingDate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("pasting an image stores it in the workspace media library", async () => {
  const { agent, assetsRoot } = await setupTempApp();
  const response = await agent
    .post("/api/assets/paste-image")
    .send({
      articlePath: "notes/draft.md",
      images: [
        {
          mimeType: "image/png",
          base64Data: Buffer.from("fakepngbytes").toString("base64"),
          fileName: "clipboard.png"
        }
      ]
    })
    .expect(200);

  assert.equal(response.body.assets.length, 1);
  assert.match(response.body.assets[0].markdownPath, /^@media\//);

  const files = await fs.readdir(assetsRoot);
  assert.equal(files.length, 1);
});

test("editor config endpoint accepts VS Code style snippet objects and jsonc", async () => {
  const { agent, tempRoot } = await setupTempApp();

  const response = await agent
    .put("/api/editor-config")
    .send({
      markdownSnippetsRaw: `{
  // markdown snippets
  "Article Frontmatter": {
    "prefix": "frontmatter",
    "body": [
      "---",
      "title: $1",
      "$0"
    ],
  }
}`,
      latexSnippetsRaw: `{
  "divide": {
    "scope": "latex,tex",
    "prefix": [
      "/",
      "\\\\frac"
    ],
    "body": "\\\\dfrac{$1}{$2} $0"
  }
}`,
      keybindingsRaw: `[
  {
    "key": "ctrl+p",
    "command": "workbench.action.showCommands"
  },
  {
    "key": "escape",
    "command": "hideSuggestWidget",
    "when": "suggestWidgetVisible"
  },
]`
    })
    .expect(200);

  assert.equal(response.body.markdownSnippets[0].name, "Article Frontmatter");
  assert.equal(response.body.latexSnippets[0].name, "divide");
  assert.equal(response.body.keybindings[0].command, "workbench.action.showCommands");

  const persistedLatexRaw = await fs.readFile(path.join(tempRoot, "config", "editor", "latex.snippets.json"), "utf8");
  assert.match(persistedLatexRaw, /"divide": \{/);
  assert.doesNotMatch(persistedLatexRaw, /"name": "divide"/);
});

test("file system endpoints create, rename, copy, and delete entries", async () => {
  const { agent, contentRoot } = await setupTempApp();

  const created = await agent
    .post("/api/fs/create")
    .send({
      parentPath: "notes",
      entryType: "file",
      name: "playwright.md",
      metadata: {
        title: "Created From Dialog",
        tags: "alpha, beta",
        top: "3"
      }
    })
    .expect(200);

  assert.equal(created.body.path, "notes/playwright.md");
  const createdRaw = await fs.readFile(path.join(contentRoot, "notes", "playwright.md"), "utf8");
  assert.match(createdRaw, /^title: Created From Dialog/m);
  assert.match(createdRaw, /^top: 3/m);
  assert.match(createdRaw, /- alpha/);

  const renamed = await agent
    .post("/api/fs/rename")
    .send({
      path: "notes/playwright.md",
      nextName: "renamed.md"
    })
    .expect(200);

  assert.equal(renamed.body.path, "notes/renamed.md");

  const copied = await agent
    .post("/api/fs/transfer")
    .send({
      sourcePath: "notes/renamed.md",
      targetDirectoryPath: "",
      mode: "copy"
    })
    .expect(200);

  assert.equal(copied.body.path, "renamed.md");

  await agent
    .post("/api/fs/delete")
    .send({
      path: "renamed.md"
    })
    .expect(200);

  await assert.rejects(() => fs.access(path.join(contentRoot, "renamed.md")));
  await fs.access(path.join(contentRoot, "notes", "renamed.md"));
});

test("directory metadata tags apply to files created beneath the directory", async () => {
  const { agent, contentRoot } = await setupTempApp();

  await agent
    .post("/api/fs/create")
    .send({
      parentPath: "notes",
      entryType: "directory",
      name: "tagged",
      metadata: {
        tags: "folder-tag"
      }
    })
    .expect(200);

  await agent
    .post("/api/fs/create")
    .send({
      parentPath: "notes/tagged",
      entryType: "file",
      name: "child.md",
      metadata: {
        title: "Child"
      }
    })
    .expect(200);

  const childRaw = await fs.readFile(path.join(contentRoot, "notes", "tagged", "child.md"), "utf8");
  assert.match(childRaw, /- folder-tag/);
});

test("creating an article with a duplicate title returns a conflict payload", async () => {
  const { agent } = await setupTempApp();

  const response = await agent
    .post("/api/fs/create")
    .send({
      parentPath: "notes",
      entryType: "file",
      name: "duplicate-title.md",
      metadata: {
        title: "Draft Note"
      }
    })
    .expect(409);

  assert.equal(response.body.code, "duplicate_article_title");
  assert.equal(response.body.conflicts[0].path, "notes/draft.md");
});

test("config endpoints expose markdown block rules and admin home defaults", async () => {
  const { agent } = await setupTempApp();

  const markdownBlocks = await agent.get("/api/markdown-block-config").expect(200);
  assert.deepEqual(markdownBlocks.body.value.rules, []);

  const adminHome = await agent.get("/api/admin-home-config").expect(200);
  assert.deepEqual(adminHome.body.value.widgetOrder, []);
  assert.deepEqual(adminHome.body.value.widgets, {});
});

test("theme group endpoints seed atlas and allow group asset creation", async () => {
  const { agent, tempRoot } = await setupTempApp();

  const seeded = await agent.get("/api/theme-groups").expect(200);
  assert.equal(seeded.body.groups[0].groupId, "atlas");
  assert.equal(seeded.body.groups[0].files.length >= 2, true);

  const createdGroup = await agent
    .post("/api/theme-group/create")
    .send({
      groupId: "chalk"
    })
    .expect(200);

  assert.equal(createdGroup.body.groupId, "chalk");

  const createdAsset = await agent
    .post("/api/theme-asset/create")
    .send({
      groupId: "chalk",
      fileName: "notes",
      type: "css",
      adminPreview: true
    })
    .expect(200);

  assert.equal(createdAsset.body.fileName, "notes.css");
  assert.equal(createdAsset.body.adminPreview, true);
  await fs.access(path.join(tempRoot, "config", "theme", "chalk", "notes.css"));
});
