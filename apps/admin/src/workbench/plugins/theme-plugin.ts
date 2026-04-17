import type { PluginDefinition } from "../types";
import { atelierLightTheme } from "../theme/atelier-light";
import { evaDarkTheme } from "../theme/eva-dark";
import { harborNightTheme } from "../theme/harbor-night";

export const themePlugin: PluginDefinition = {
  id: "theme-system",
  label: "Theme System",
  description: "Registers available workbench themes and exposes the theme picker command.",
  activate(context) {
    context.registerTheme(evaDarkTheme);
    context.registerTheme(atelierLightTheme);
    context.registerTheme(harborNightTheme);
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
  }
};
