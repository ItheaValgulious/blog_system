import type { PluginDefinition } from "../types";

export const coreWorkbenchPlugin: PluginDefinition = {
  id: "core-workbench",
  label: "Core Workbench",
  description: "Provides the base workbench commands for layout, saving, and publishing.",
  activate(context) {
    context.registerCommand({
      id: "workbench.toggleSidebar",
      title: "View: Toggle Sidebar",
      keywords: ["sidebar", "explorer", "view"],
      handler(api) {
        api.toggleSidebar();
      }
    });
    context.registerCommand({
      id: "workbench.togglePreview",
      title: "View: Toggle Preview",
      keywords: ["preview", "markdown", "view"],
      handler(api) {
        api.togglePreview();
      }
    });
    context.registerCommand({
      id: "workbench.openHome",
      title: "View: Open Admin Home",
      keywords: ["home", "dashboard", "start"],
      handler(api) {
        api.openHome();
      }
    });
    context.registerCommand({
      id: "workbench.saveActiveDocument",
      title: "File: Save Active Document",
      keywords: ["save", "document", "file"],
      handler(api) {
        void api.saveActiveDocument();
      }
    });
    context.registerCommand({
      id: "blog.publishStaticSite",
      title: "Blog: Publish Static Site",
      keywords: ["publish", "deploy", "github", "static"],
      handler(api) {
        void api.publishStaticSite();
      }
    });
  }
};
