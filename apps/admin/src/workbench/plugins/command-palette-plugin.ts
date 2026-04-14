import type { PluginDefinition } from "../types";

export const commandPalettePlugin: PluginDefinition = {
  id: "command-palette",
  label: "Command Palette",
  description: "Adds the command palette and JSON configuration entry points.",
  activate(context) {
    context.registerCommand({
      id: "workbench.showCommandPalette",
      title: "View: Show Command Palette",
      keywords: ["command", "palette", "settings", "open"],
      handler(api) {
        api.showCommandPalette();
      }
    });
    context.registerCommand({
      id: "preferences.openMarkdownSnippetsJson",
      title: "Preferences: Open Markdown Snippets (JSON)",
      keywords: ["settings", "markdown", "snippets", "json"],
      handler(api) {
        void api.openConfigDocument("markdownSnippets");
      }
    });
    context.registerCommand({
      id: "preferences.openLatexSnippetsJson",
      title: "Preferences: Open LaTeX Snippets (JSON)",
      keywords: ["settings", "latex", "snippets", "json", "math"],
      handler(api) {
        void api.openConfigDocument("latexSnippets");
      }
    });
    context.registerCommand({
      id: "preferences.openKeybindingsJson",
      title: "Preferences: Open Keybindings (JSON)",
      keywords: ["settings", "keybindings", "json", "shortcuts"],
      handler(api) {
        void api.openConfigDocument("keybindings");
      }
    });
    context.registerCommand({
      id: "preferences.openSiteConfigJson",
      title: "Preferences: Open Site Config (JSON)",
      keywords: ["settings", "site", "plugins", "theme", "json"],
      handler(api) {
        void api.openConfigDocument("siteConfig");
      }
    });
    context.registerCommand({
      id: "preferences.openSiteThemeJson",
      title: "Preferences: Open Site Theme (JSON)",
      keywords: ["settings", "site", "theme", "colors", "json"],
      handler(api) {
        void api.openConfigDocument("siteThemeAtlas");
      }
    });
  }
};
