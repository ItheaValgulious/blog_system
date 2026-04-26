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
  const projectsRoot = path.join(tempRoot, "projects");
  const editorConfigDir = path.join(configRoot, "editor");
  await fs.mkdir(path.join(contentRoot, "notes"), { recursive: true });
  await fs.mkdir(assetsRoot, { recursive: true });
  await fs.mkdir(editorConfigDir, { recursive: true });
  await fs.mkdir(projectsRoot, { recursive: true });

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
    projectsRoot,
    workspaceRoot: tempRoot,
    configRoot,
    assetsRoot
  });
  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  return { tempRoot, assetsRoot, contentRoot, projectsRoot, agent };
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
]`,
      editorAssociationsRaw: `{
  "*.md": "workbench.article-markdown",
  "*.json": "workbench.code-text"
}`
    })
    .expect(200);

  assert.equal(response.body.markdownSnippets[0].name, "Article Frontmatter");
  assert.equal(response.body.latexSnippets[0].name, "divide");
  assert.equal(response.body.keybindings[0].command, "workbench.action.showCommands");
  assert.equal(response.body.editorAssociations["*.md"], "workbench.article-markdown");

  const persistedLatexRaw = await fs.readFile(path.join(tempRoot, "config", "editor", "latex.snippets.json"), "utf8");
  const persistedEditorAssociationsRaw = await fs.readFile(
    path.join(tempRoot, "config", "editor", "editor.associations.json"),
    "utf8"
  );
  assert.match(persistedLatexRaw, /"divide": \{/);
  assert.doesNotMatch(persistedLatexRaw, /"name": "divide"/);
  assert.match(persistedEditorAssociationsRaw, /"\*\.md": "workbench\.article-markdown"/);
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

test("site config rejects legacy about payloads", async () => {
  const { agent } = await setupTempApp();

  const response = await agent
    .put("/api/site-config")
    .send({
      raw: `{
  "siteTitle": "Knowledge Base",
  "enabledPlugins": ["home"],
  "about": {
    "title": "About",
    "body": "Legacy field"
  }
}`
    })
    .expect(500);

  assert.match(response.body.error, /siteConfig must NOT have additional properties/);
});

test("project endpoints create resources and index task and log references", async () => {
  const { agent, projectsRoot } = await setupTempApp();

  const createdProject = await agent
    .post("/api/project/create")
    .send({
      goal: "Ship the project workspace",
      targetDate: "2026-05-31",
      title: "Demo Project"
    })
    .expect(200);

  assert.equal(createdProject.body.value.id, "demo-project");
  assert.equal(createdProject.body.value.status, "active");
  assert.equal(createdProject.body.value.taskCount, 0);
  assert.match(createdProject.body.value.startDate, /^\d{4}-\d{2}-\d{2}$/);
  await fs.access(path.join(projectsRoot, "demo-project", "project.json"));

  const savedProject = await agent
    .put("/api/project")
    .send({
      projectId: "demo-project",
      raw: (createdProject.body.raw as string).replace('"status": "active"', '"status": "archieved"')
    })
    .expect(200);

  assert.equal(savedProject.body.value.status, "active");

  const createdResource = await agent
    .post("/api/project/resource/create")
    .send({
      projectId: "demo-project",
      title: "Spec Image",
      type: "file",
      file: {
        base64Data: Buffer.from("fakepngbytes").toString("base64"),
        fileName: "spec.png"
      }
    })
    .expect(200);

  const resourceId = createdResource.body.value.id as string;
  const resourceRef = `@resource/${resourceId}`;
  await fs.access(path.join(projectsRoot, "demo-project", createdResource.body.value.filePath));

  const createdTask = await agent
    .post("/api/project/task/create")
    .send({
      projectId: "demo-project",
      title: "Implement UI"
    })
    .expect(200);

  const savedTask = await agent
    .put("/api/project/task")
    .send({
      projectId: "demo-project",
      taskId: createdTask.body.value.id,
      raw: `${(createdTask.body.raw as string).replace("status: todo", "status: blocked")}\nUses ${resourceRef}\n`
    })
    .expect(200);

  assert.equal(savedTask.body.value.status, "todo");
  assert.deepEqual(savedTask.body.value.resourceIds, [resourceId]);

  const createdLog = await agent
    .post("/api/project/log/create")
    .send({
      projectId: "demo-project",
      type: "progress"
    })
    .expect(200);

  const savedLog = await agent
    .put("/api/project/log")
    .send({
      projectId: "demo-project",
      logId: createdLog.body.value.id,
      raw: `${createdLog.body.raw}\nCaptured ${resourceRef}\n`
    })
    .expect(200);

  assert.deepEqual(savedLog.body.value.resourceIds, [resourceId]);

  const listedProjects = await agent.get("/api/projects").expect(200);
  assert.equal(listedProjects.body.projects[0].taskCount, 1);
  assert.equal(listedProjects.body.projects[0].completedTaskCount, 0);
  assert.equal(listedProjects.body.projects[0].recentActivityCount, 1);
});

test("project resource endpoint rejects textbook type", async () => {
  const { agent } = await setupTempApp();

  await agent
    .post("/api/project/create")
    .send({
      title: "Resource Validation"
    })
    .expect(200);

  await agent
    .post("/api/project/resource/create")
    .send({
      projectId: "resource-validation",
      title: "Legacy Textbook",
      type: "textbook"
    })
    .expect(400);
});

test("project delete endpoint removes the project directory and listings", async () => {
  const { agent, projectsRoot } = await setupTempApp();

  await agent
    .post("/api/project/create")
    .send({
      title: "Delete Me"
    })
    .expect(200);

  const createdTask = await agent
    .post("/api/project/task/create")
    .send({
      projectId: "delete-me",
      title: "Temporary Task"
    })
    .expect(200);

  const createdLog = await agent
    .post("/api/project/log/create")
    .send({
      projectId: "delete-me",
      type: "note"
    })
    .expect(200);

  await agent
    .post("/api/project/resource/create")
    .send({
      projectId: "delete-me",
      title: "Temporary File",
      type: "file",
      file: {
        base64Data: Buffer.from("temporary-bytes").toString("base64"),
        fileName: "temp.txt"
      }
    })
    .expect(200);

  assert.ok(createdTask.body.value.id);
  assert.ok(createdLog.body.value.id);
  await fs.access(path.join(projectsRoot, "delete-me"));

  await agent
    .post("/api/project/delete")
    .send({
      projectId: "delete-me"
    })
    .expect(200);

  await assert.rejects(() => fs.access(path.join(projectsRoot, "delete-me")));

  const listedProjects = await agent.get("/api/projects").expect(200);
  assert.equal(listedProjects.body.projects.some((project: { id: string }) => project.id === "delete-me"), false);
});

test("theme group endpoints seed atlas and allow group asset creation", async () => {
  const { agent, tempRoot } = await setupTempApp();

  const seeded = await agent.get("/api/theme-groups").expect(200);
  assert.equal(seeded.body.groups[0].groupId, "atlas");
  assert.equal(seeded.body.groups[0].mode, "light");
  assert.equal(seeded.body.groups[0].files.length >= 4, true);
  assert.ok(seeded.body.groups[0].files.some((file: { fileName: string; colorMode?: string }) => file.fileName === "chrome.light.css" && file.colorMode === "light"));
  assert.ok(seeded.body.groups[0].files.some((file: { fileName: string; colorMode?: string }) => file.fileName === "chrome.dark.css" && file.colorMode === "dark"));

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

  assert.equal(createdAsset.body.fileName, "notes.light.css");
  assert.equal(createdAsset.body.adminPreview, true);
  assert.equal(createdAsset.body.colorMode, "light");
  await fs.access(path.join(tempRoot, "config", "theme", "chalk", "notes.light.css"));
});
