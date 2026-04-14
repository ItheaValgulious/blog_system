import type { PluginDefinition } from "../types";

export const gitPlugin: PluginDefinition = {
  id: "git",
  label: "Git",
  description: "Adds a git tab for content/assets change review and commits.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "git-sidebar-view",
      kind: "sidebar-view",
      label: "GT",
      title: "Git",
      viewId: "git"
    });
  }
};
