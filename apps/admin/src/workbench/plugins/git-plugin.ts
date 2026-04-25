import type { PluginDefinition } from "../types";
import { GitPane } from "../panes/git-pane";

export const gitPlugin: PluginDefinition = {
  id: "git",
  label: "Git",
  description: "Adds a git tab for content/assets change review and commits.",
  activate(context) {
    context.registerWorkbenchContribution({
      component: GitPane,
      defaultGroupId: "explorer",
      id: "git-pane",
      kind: "pane",
      paneId: "git",
      tabLabel: "Git",
      title: "Git"
    });
  }
};
