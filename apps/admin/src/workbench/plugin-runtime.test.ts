import assert from "node:assert/strict";
import test from "node:test";

import { builtInPlugins } from "./builtins";
import { PluginRuntime } from "./plugin-runtime";
import { commandPalettePlugin } from "./plugins/command-palette-plugin";
import { coreWorkbenchPlugin } from "./plugins/core-workbench-plugin";
import { markdownOutlinePlugin } from "./plugins/markdown-outline-plugin";
import { mediaLibraryPlugin } from "./plugins/media-library-plugin";

import type { PaneContributionDefinition, WorkbenchApi } from "./types";

function getPaneIds(runtime: PluginRuntime) {
  return runtime
    .getWorkbenchContributions()
    .filter((contribution): contribution is PaneContributionDefinition => contribution.kind === "pane")
    .map((contribution) => contribution.paneId);
}

test("PluginRuntime exposes registered pane and editor contributions", () => {
  const runtime = new PluginRuntime();
  runtime.activate([coreWorkbenchPlugin, mediaLibraryPlugin]);

  assert.ok(runtime.getEditorContribution("workbench.article-markdown"));
  assert.ok(getPaneIds(runtime).includes("media"));
});

test("markdown outline pane registers into the dedicated outline group", () => {
  const runtime = new PluginRuntime();
  runtime.activate([markdownOutlinePlugin]);

  const outlinePane = runtime
    .getWorkbenchContributions()
    .find((contribution): contribution is PaneContributionDefinition => contribution.kind === "pane" && contribution.paneId === "outline");

  assert.ok(outlinePane);
  assert.equal(outlinePane?.defaultGroupId, "outline");
});

test("command palette plugin exposes Reopen With Editor command", async () => {
  const runtime = new PluginRuntime();
  runtime.activate([commandPalettePlugin]);

  const reopenCommand = runtime.getCommand("workbench.reopenWithEditor");
  assert.ok(reopenCommand);

  let called = false;
  await reopenCommand?.handler({
    showReopenWithEditor() {
      called = true;
    }
  } as WorkbenchApi);

  assert.equal(called, true);
});

test("disabling a built-in plugin removes only that plugin's pane contribution", () => {
  const runtime = new PluginRuntime();
  runtime.activate(builtInPlugins.filter((plugin) => plugin.id !== "git"));

  const paneIds = getPaneIds(runtime);
  assert.ok(paneIds.includes("media"));
  assert.equal(paneIds.includes("git"), false);
});
