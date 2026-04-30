import type { PluginDefinition } from "../types";
import { GlobalSearchReplacePane } from "../panes/global-search-replace-pane";

const GLOBAL_SEARCH_PANE_ID = "global-search-replace";

export const globalSearchReplacePlugin: PluginDefinition = {
  id: "global-search-replace",
  label: "Global Search Replace",
  description: "Adds regex search and replace across all markdown files in the content workspace.",
  activate(context) {
    context.registerWorkbenchContribution({
      component: GlobalSearchReplacePane,
      defaultGroupId: "edit",
      id: "global-search-replace-pane",
      kind: "pane",
      paneId: GLOBAL_SEARCH_PANE_ID,
      tabLabel: "Search",
      title: "Global Search"
    });
    context.registerCommand({
      id: "search.openGlobalMarkdownSearch",
      title: "Search: Open Global Markdown Search",
      keywords: ["search", "replace", "regex", "markdown", "content"],
      handler(api) {
        api.showSidebarModule("edit", GLOBAL_SEARCH_PANE_ID);
      }
    });
  }
};
