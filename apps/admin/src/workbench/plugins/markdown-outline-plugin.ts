import type { PluginDefinition } from "../types";
import { OutlinePane } from "../panes/outline-pane";

export const markdownOutlinePlugin: PluginDefinition = {
  id: "markdown-outline",
  label: "Markdown Outline",
  description: "Adds a sidebar outline tree for markdown headings with click-to-jump navigation.",
  activate(context) {
    context.registerWorkbenchContribution({
      component: OutlinePane,
      defaultGroupId: "outline",
      id: "markdown-outline-pane",
      kind: "pane",
      paneId: "outline",
      tabLabel: "Outline",
      title: "Outline"
    });
  }
};
