import type { ComponentType } from "react";
import type * as monacoEditor from "monaco-editor";

import type { ArticleRecord, EditorKeybinding, EditorSnippet } from "@blog-system/content-core";

export type SidebarViewId = "explorer" | "edit" | "plugins" | "outline" | "media" | "git";
export type ConfigDocumentKind =
  | "markdownBlockConfig"
  | "markdownSnippets"
  | "latexSnippets"
  | "keybindings"
  | "siteConfig";
export type WorkbenchDocumentKind = "article" | "config" | "home" | "themeAsset";
export type SnippetLanguageId = "markdown" | "latex";

export interface WorkbenchBaseDocument {
  id: string;
  kind: WorkbenchDocumentKind;
  title: string;
  language: "markdown" | "json" | "css" | "javascript";
  value: string;
  savedValue: string;
  dirty: boolean;
  previewable: boolean;
}

export interface ArticleWorkbenchDocument extends WorkbenchBaseDocument {
  kind: "article";
  articlePath: string;
  record: ArticleRecord;
}

export interface HomeWorkbenchDocument extends WorkbenchBaseDocument {
  kind: "home";
}

export interface ConfigWorkbenchDocument extends WorkbenchBaseDocument {
  kind: "config";
  configKind: ConfigDocumentKind;
}

export interface ThemeAssetWorkbenchDocument extends WorkbenchBaseDocument {
  kind: "themeAsset";
  assetPath: string;
  fileName: string;
  groupId: string;
  editorPath: string;
}

export type WorkbenchDocument =
  | ArticleWorkbenchDocument
  | ConfigWorkbenchDocument
  | HomeWorkbenchDocument
  | ThemeAssetWorkbenchDocument;

export interface ThemeDefinition {
  id: string;
  label: string;
  appearance: "dark" | "light";
  cssVariables: Record<string, string>;
  monacoTheme: monacoEditor.editor.IStandaloneThemeData;
}

export interface CommandDefinition {
  id: string;
  title: string;
  keywords?: string[];
  handler: (api: WorkbenchApi) => void | Promise<void>;
}

export interface EditorActionDefinition {
  id: string;
  title: string;
  handler: (api: EditorActionApi) => boolean | Promise<boolean>;
}

export interface PasteHandlerDefinition {
  id: string;
  handle: (api: PasteHandlerApi) => boolean | Promise<boolean>;
}

export type WorkbenchContributionKind = "create-dialog" | "home-widget" | "sidebar-view";
export type CreateDialogFieldInput = "text" | "tags" | "number";

export interface CreateDialogFieldDefinition {
  id: string;
  label: string;
  appliesTo: "file" | "directory" | "both";
  input: CreateDialogFieldInput;
  defaultValue?: string;
  placeholder?: string;
}

export interface WorkbenchContributionDefinition {
  id: string;
  kind: WorkbenchContributionKind;
}

export interface CreateDialogContributionDefinition extends WorkbenchContributionDefinition {
  kind: "create-dialog";
  fields: CreateDialogFieldDefinition[];
}

export interface SidebarViewContributionDefinition extends WorkbenchContributionDefinition {
  kind: "sidebar-view";
  label: string;
  title: string;
  viewId: SidebarViewId;
}

export interface HomeWidgetComponentProps<TState = unknown> {
  setState: (nextState: TState) => void;
  state: TState | undefined;
  widgetId: string;
}

export interface HomeWidgetContributionDefinition extends WorkbenchContributionDefinition {
  component: ComponentType<HomeWidgetComponentProps>;
  kind: "home-widget";
  label: string;
  widgetId: string;
}

export interface PluginDefinition {
  id: string;
  label: string;
  description: string;
  activate: (context: PluginSetupContext) => void;
}

export interface ClipboardImageInput {
  mimeType: string;
  base64Data: string;
  fileName?: string;
}

export interface ClipboardImageResult {
  fileName: string;
  relativePath: string;
  markdownPath: string;
}

export interface WorkbenchApi {
  openHome: () => void;
  showCommandPalette: () => void;
  hideCommandPalette: () => void;
  showThemePicker: () => void;
  startThemeGroupCreate: () => void;
  toggleSidebar: () => void;
  togglePreview: () => void;
  saveActiveDocument: () => Promise<void>;
  openConfigDocument: (kind: ConfigDocumentKind) => Promise<void>;
  publishStaticSite: () => Promise<void>;
  setTheme: (themeId: string) => void;
}

export interface EditorActionApi {
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  monaco: typeof monacoEditor;
  activeDocument: WorkbenchDocument | null;
  snippets: EditorSnippet[];
}

export interface PasteHandlerApi {
  event: ClipboardEvent;
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  activeDocument: WorkbenchDocument | null;
  uploadClipboardImages: (
    articlePath: string,
    images: ClipboardImageInput[]
  ) => Promise<ClipboardImageResult[]>;
}

export interface PluginSetupContext {
  registerCommand: (command: CommandDefinition) => void;
  registerEditorAction: (action: EditorActionDefinition) => void;
  registerTheme: (theme: ThemeDefinition) => void;
  registerPasteHandler: (handler: PasteHandlerDefinition) => void;
  registerWorkbenchContribution: (contribution: WorkbenchContributionDefinition) => void;
}

export interface NormalizedSnippet extends EditorSnippet {
  environment: SnippetLanguageId;
  prefix: string[];
}

export interface NormalizedEditorConfig {
  markdownSnippets: NormalizedSnippet[];
  latexSnippets: NormalizedSnippet[];
  keybindings: EditorKeybinding[];
}
