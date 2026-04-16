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

test("render config endpoint returns defaults and persists updates", async () => {
  const { agent, tempRoot } = await setupTempApp();

  const initial = await agent.get("/api/render-config").expect(200);
  assert.deepEqual(initial.body.value.styles, []);

  const saved = await agent
    .put("/api/render-config")
    .send({
      raw: JSON.stringify(
        {
          styles: [
            {
              directory: "water.css",
              enable: true
            }
          ]
        },
        null,
        2
      )
    })
    .expect(200);

  assert.equal(saved.body.value.styles[0].directory, "water.css");

  const persistedRaw = await fs.readFile(path.join(tempRoot, "config", "render.json"), "utf8");
  assert.match(persistedRaw, /"water\.css"/);
});

test("render style endpoint creates css file and registers it in render.json", async () => {
  const { agent, tempRoot } = await setupTempApp();

  const created = await agent
    .post("/api/render-style/create")
    .send({
      fileName: "paper"
    })
    .expect(200);

  assert.equal(created.body.directory, "paper.css");
  assert.match(created.body.raw, /config\/render\/paper\.css/);
  assert.equal(created.body.renderConfig.value.styles[0].directory, "paper.css");
  assert.equal(created.body.renderConfig.value.styles[0].enable, true);

  const cssRaw = await fs.readFile(path.join(tempRoot, "config", "render", "paper.css"), "utf8");
  assert.match(cssRaw, /paper\.css/);
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
