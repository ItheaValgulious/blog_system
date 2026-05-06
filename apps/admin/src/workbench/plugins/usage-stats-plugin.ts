import type { PluginDefinition } from "../types";
import { UsageStatsEditor } from "../editors/usage-stats-editor";

export const usageStatsPlugin: PluginDefinition = {
  id: "usage-stats",
  label: "Usage Stats",
  description: "Tracks persistent editing delta and active usage time, and opens a dedicated stats tab.",
  activate(context) {
    context.registerEditorContribution({
      canHandle: (document) => document.kind === "usageStats",
      component: UsageStatsEditor,
      editorId: "usage-stats.overview",
      label: "Usage Stats",
      matches: (document) => document.kind === "usageStats"
    });
    context.registerCommand({
      id: "usageStats.open",
      title: "Usage Stats: Open Statistics",
      keywords: ["usage", "stats", "statistics", "tracking", "time", "characters"],
      handler(api) {
        void api.openResource({
          kind: "usageStats"
        });
      }
    });
  }
};
