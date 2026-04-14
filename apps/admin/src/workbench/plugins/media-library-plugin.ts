import type { PluginDefinition } from "../types";

export const mediaLibraryPlugin: PluginDefinition = {
  id: "media-library",
  label: "Media Library",
  description: "Adds a media tab for uploading and browsing centralized images.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "media-sidebar-view",
      kind: "sidebar-view",
      label: "MD",
      title: "Media",
      viewId: "media"
    });
  }
};
