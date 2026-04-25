import type { PluginDefinition } from "../types";

export const markdownOutlinePlugin: PluginDefinition = {
  id: "markdown-outline",
  label: "Markdown Outline",
  description: "Adds a sidebar outline tree for markdown headings with click-to-jump navigation.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "markdown-outline-sidebar-view",
      kind: "sidebar-view",
      label: "OL",
      title: "Outline",
      viewId: "outline"
    });
  }
};
