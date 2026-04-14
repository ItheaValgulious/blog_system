import type { ThemeDefinition } from "../types";

export const harborNightTheme: ThemeDefinition = {
  id: "harbor-night",
  label: "Harbor Night",
  appearance: "dark",
  cssVariables: {
    "--wb-bg": "#14212b",
    "--wb-bg-elevated": "#1b2d3a",
    "--wb-bg-sidebar": "#10202c",
    "--wb-bg-panel": "#203645",
    "--wb-bg-active": "#29475a",
    "--wb-bg-hover": "#2f556b",
    "--wb-border": "#42627a",
    "--wb-foreground": "#e4edf4",
    "--wb-foreground-muted": "#98b2c6",
    "--wb-accent": "#4fc3ff",
    "--wb-accent-strong": "#ffd166",
    "--wb-warning": "#ffb454",
    "--wb-danger": "#ff7a90",
    "--wb-shadow": "0 18px 48px rgba(0, 0, 0, 0.36)"
  },
  monacoTheme: {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "e4edf4", background: "1b2d3a" },
      { token: "comment", foreground: "7f96a8" },
      { token: "keyword", foreground: "ffd166" },
      { token: "number", foreground: "ffb454" },
      { token: "string", foreground: "8de3c0" },
      { token: "delimiter", foreground: "dce7ef" },
      { token: "type", foreground: "4fc3ff" },
      { token: "tag", foreground: "ff7a90" }
    ],
    colors: {
      "editor.background": "#1b2d3a",
      "editor.foreground": "#e4edf4",
      "editorLineNumber.foreground": "#607f95",
      "editorLineNumber.activeForeground": "#e4edf4",
      "editorCursor.foreground": "#ffd166",
      "editor.selectionBackground": "#42627a80",
      "editor.inactiveSelectionBackground": "#42627a55",
      "editorLineHighlightBackground": "#29475a88",
      "editorIndentGuide.background1": "#42627a",
      "editorIndentGuide.activeBackground1": "#6d8aa1",
      "editorWidget.background": "#10202c",
      "editorWidget.border": "#42627a",
      "editorSuggestWidget.background": "#10202c",
      "editorSuggestWidget.border": "#42627a",
      "editorSuggestWidget.selectedBackground": "#29475a",
      "editorHoverWidget.background": "#10202c",
      "editorHoverWidget.border": "#42627a"
    }
  }
};
