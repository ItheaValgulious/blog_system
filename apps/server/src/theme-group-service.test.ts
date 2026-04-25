import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listEnabledThemeAssets, readThemeGroupConfig } from "./theme-group-service.js";

async function createTempConfigRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-theme-groups-"));
  const configRoot = path.join(tempRoot, "config");
  await fs.mkdir(path.join(configRoot, "theme"), { recursive: true });
  return { configRoot, tempRoot };
}

test("readThemeGroupConfig migrates a legacy css asset into light and dark files", async () => {
  const { configRoot } = await createTempConfigRoot();
  const groupDirectory = path.join(configRoot, "theme", "sketch");
  await fs.mkdir(groupDirectory, { recursive: true });
  await fs.writeFile(
    path.join(groupDirectory, "theme.json"),
    `${JSON.stringify({
      enable: true,
      files: [
        {
          fileName: "prose.css",
          type: "css",
          adminPreview: true
        }
      ],
      label: "Sketch"
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(groupDirectory, "prose.css"),
    `body {
  background: #faf7f0;
  color: #1f2937;
}\n`,
    "utf8"
  );

  const loaded = await readThemeGroupConfig(configRoot, "sketch");

  assert.equal(loaded.value.mode, "light");
  assert.deepEqual(
    loaded.value.files.map((file) => file.fileName),
    ["prose.light.css", "prose.dark.css"]
  );
  assert.deepEqual(
    loaded.value.files.map((file) => (file.type === "css" ? file.colorMode : null)),
    ["light", "dark"]
  );
  await fs.access(path.join(groupDirectory, "prose.light.css"));
  await fs.access(path.join(groupDirectory, "prose.dark.css"));
});

test("listEnabledThemeAssets only returns css that matches the group mode", async () => {
  const { configRoot } = await createTempConfigRoot();
  const groupDirectory = path.join(configRoot, "theme", "atlas");
  await fs.mkdir(groupDirectory, { recursive: true });
  await fs.writeFile(
    path.join(groupDirectory, "theme.json"),
    `${JSON.stringify({
      enable: true,
      files: [
        {
          adminPreview: true,
          colorMode: "light",
          fileName: "prose.light.css",
          type: "css"
        },
        {
          adminPreview: true,
          colorMode: "dark",
          fileName: "prose.dark.css",
          type: "css"
        },
        {
          adminPreview: false,
          fileName: "preview.js",
          type: "js"
        }
      ],
      label: "Atlas",
      mode: "dark"
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(groupDirectory, "prose.light.css"), "body { background: white; color: black; }\n", "utf8");
  await fs.writeFile(path.join(groupDirectory, "prose.dark.css"), "body { background: #10151b; color: #edf2f7; }\n", "utf8");
  await fs.writeFile(path.join(groupDirectory, "preview.js"), "console.log('preview');\n", "utf8");

  const assets = await listEnabledThemeAssets(configRoot);

  assert.deepEqual(
    assets.map((asset) => asset.fileName).sort(),
    ["preview.js", "prose.dark.css"]
  );
});
