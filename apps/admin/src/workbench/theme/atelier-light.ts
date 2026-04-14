import type { ThemeDefinition } from "../types";

export const atelierLightTheme: ThemeDefinition = {
  id: "atelier-light",
  label: "Atelier Light",
  appearance: "light",
  cssVariables: {
    "--wb-bg": "#f4efe5",
    "--wb-bg-elevated": "#fbf6ee",
    "--wb-bg-sidebar": "#ebe2d4",
    "--wb-bg-panel": "#f7f1e7",
    "--wb-bg-active": "#decfb6",
    "--wb-bg-hover": "#e7dac4",
    "--wb-border": "#c9b79c",
    "--wb-foreground": "#3b2d20",
    "--wb-foreground-muted": "#7d6a58",
    "--wb-accent": "#b55c33",
    "--wb-accent-strong": "#1d8f73",
    "--wb-warning": "#d78c1e",
    "--wb-danger": "#b64248",
    "--wb-shadow": "0 18px 48px rgba(79, 56, 29, 0.18)"
  },
  monacoTheme: {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "3b2d20", background: "fbf6ee" },
      { token: "comment", foreground: "8b7b69" },
      { token: "keyword", foreground: "915229" },
      { token: "number", foreground: "c07d12" },
      { token: "string", foreground: "2c8f78" },
      { token: "delimiter", foreground: "4d3a28" },
      { token: "type", foreground: "8f3c7d" },
      { token: "tag", foreground: "b64248" }
    ],
    colors: {
      "editor.background": "#fbf6ee",
      "editor.foreground": "#3b2d20",
      "editorLineNumber.foreground": "#a58f76",
      "editorLineNumber.activeForeground": "#3b2d20",
      "editorCursor.foreground": "#1d8f73",
      "editor.selectionBackground": "#decfb688",
      "editor.inactiveSelectionBackground": "#decfb655",
      "editorLineHighlightBackground": "#ebe2d499",
      "editorIndentGuide.background1": "#c9b79c",
      "editorIndentGuide.activeBackground1": "#9c8467",
      "editorWidget.background": "#f4efe5",
      "editorWidget.border": "#c9b79c",
      "editorSuggestWidget.background": "#f4efe5",
      "editorSuggestWidget.border": "#c9b79c",
      "editorSuggestWidget.selectedBackground": "#decfb6",
      "editorHoverWidget.background": "#f4efe5",
      "editorHoverWidget.border": "#c9b79c"
    }
  }
};
