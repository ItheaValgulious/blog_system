import type { PluginDefinition } from "../types";
import { MediaPane } from "../panes/media-pane";

export const mediaLibraryPlugin: PluginDefinition = {
  id: "media-library",
  label: "Media Library",
  description: "Adds a media tab for uploading and browsing centralized images.",
  activate(context) {
    context.registerWorkbenchContribution({
      component: MediaPane,
      defaultGroupId: "explorer",
      id: "media-pane",
      kind: "pane",
      paneId: "media",
      tabLabel: "Media",
      title: "Media"
    });
  }
};
