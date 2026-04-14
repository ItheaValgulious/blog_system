import type { ThemeDefinition } from "../types";

export const evaDarkTheme: ThemeDefinition = {
  id: "eva-dark",
  label: "Eva Dark",
  appearance: "dark",
  cssVariables: {
    "--wb-bg": "#202a33",
    "--wb-bg-elevated": "#253340",
    "--wb-bg-sidebar": "#1c262f",
    "--wb-bg-panel": "#2a3b47",
    "--wb-bg-active": "#314553",
    "--wb-bg-hover": "#395060",
    "--wb-border": "#3f5564",
    "--wb-foreground": "#d8dee9",
    "--wb-foreground-muted": "#9db2c1",
    "--wb-accent": "#1fb6ff",
    "--wb-accent-strong": "#14e2b8",
    "--wb-warning": "#f7b955",
    "--wb-danger": "#ff7b8a",
    "--wb-shadow": "0 18px 48px rgba(0, 0, 0, 0.32)"
  },
  monacoTheme: {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "d8dee9", background: "253340" },
      { token: "comment", foreground: "7f95a6" },
      { token: "keyword", foreground: "8ab5ff" },
      { token: "number", foreground: "f7b955" },
      { token: "string", foreground: "9be36c" },
      { token: "delimiter", foreground: "d8dee9" },
      { token: "type", foreground: "1fb6ff" },
      { token: "tag", foreground: "ff7b8a" }
    ],
    colors: {
      "editor.background": "#253340",
      "editor.foreground": "#d8dee9",
      "editorLineNumber.foreground": "#587181",
      "editorLineNumber.activeForeground": "#d8dee9",
      "editorCursor.foreground": "#14e2b8",
      "editor.selectionBackground": "#3f556480",
      "editor.inactiveSelectionBackground": "#3f556455",
      "editorLineHighlightBackground": "#31455388",
      "editorIndentGuide.background1": "#3f5564",
      "editorIndentGuide.activeBackground1": "#5a7485",
      "editorWidget.background": "#1c262f",
      "editorWidget.border": "#3f5564",
      "editorSuggestWidget.background": "#1c262f",
      "editorSuggestWidget.border": "#3f5564",
      "editorSuggestWidget.selectedBackground": "#314553",
      "editorHoverWidget.background": "#1c262f",
      "editorHoverWidget.border": "#3f5564"
    }
  }
};
