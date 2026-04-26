import type { PluginDefinition } from "../types";
import { ThemePane } from "../panes/theme-pane";
import { atelierLightTheme } from "../theme/atelier-light";
import { evaDarkTheme } from "../theme/eva-dark";

export const themePlugin: PluginDefinition = {
  id: "theme-system",
  label: "Theme System",
  description: "Registers available workbench themes and exposes the theme picker command.",
  activate(context) {
    context.registerTheme(evaDarkTheme);
    context.registerTheme(atelierLightTheme);
    context.registerCommand({
      id: "preferences.changeTheme",
      title: "Preferences: Change Theme",
      keywords: ["theme", "color", "appearance"],
      handler(api) {
        api.showThemePicker();
      }
    });
    context.registerCommand({
      id: "theme.createThemeGroup",
      title: "Theme: Create Theme Group",
      keywords: ["theme", "group", "css", "js", "create"],
      handler(api) {
        api.startThemeGroupCreate();
      }
    });
    context.registerWorkbenchContribution({
      component: ThemePane,
      defaultGroupId: "edit",
      id: "theme-pane",
      kind: "pane",
      paneId: "theme",
      tabLabel: "Theme",
      title: "Theme"
    });
  }
};
