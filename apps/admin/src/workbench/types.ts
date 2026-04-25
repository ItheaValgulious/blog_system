import type { ComponentType } from "react";
import type * as monacoEditor from "monaco-editor";

import type {
  AdminHomeConfig,
  ArticleRecord,
  EditorKeybinding,
  EditorSnippet
} from "@blog-system/content-core";

export type PaneGroupId = string;
export type ConfigDocumentKind =
  | "markdownBlockConfig"
  | "markdownSnippets"
  | "latexSnippets"
  | "keybindings"
  | "editorAssociations"
  | "siteConfig";
export type WorkbenchDocumentKind = string;
export type WorkbenchEditorId = string;
export type SnippetLanguageId = "markdown" | "latex";
export type WorkbenchRefreshTarget =
  | "adminHome"
  | "config"
  | "markdownBlockConfig"
  | "siteConfig"
  | "themeGroups"
  | "tree";

export interface WorkbenchBaseDocument {
  id: string;
  kind: WorkbenchDocumentKind;
  editorId: WorkbenchEditorId;
  title: string;
  language: string;
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

export interface GenericWorkbenchDocument extends WorkbenchBaseDocument {
  kind: WorkbenchDocumentKind;
  [key: string]: unknown;
}

export type WorkbenchDocument =
  | ArticleWorkbenchDocument
  | ConfigWorkbenchDocument
  | HomeWorkbenchDocument
  | ThemeAssetWorkbenchDocument
  | GenericWorkbenchDocument;

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

export type WorkbenchContributionKind = "create-dialog" | "home-widget" | "pane";
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

export interface PaneComponentProps {
  activeDocument: WorkbenchDocument | null;
  activeArticleLineNumber: number;
  api: WorkbenchApi;
}

export interface PaneContributionDefinition extends WorkbenchContributionDefinition {
  component: ComponentType<PaneComponentProps>;
  defaultGroupId: PaneGroupId;
  kind: "pane";
  paneId: string;
  tabLabel: string;
  title: string;
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

export interface WorkbenchEditorComponentProps {
  adminHomeValue: AdminHomeConfig | null;
  document: WorkbenchDocument;
  homeWidgets: HomeWidgetContributionDefinition[];
  onChange: (nextValue: string) => void;
  onChangeHomeConfig: (nextValue: AdminHomeConfig) => void;
  onMount: (
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    monaco: typeof monacoEditor
  ) => void;
  path: string;
  value: string;
}

export interface EditorContributionDefinition {
  canHandle: (document: WorkbenchDocument) => boolean;
  component: ComponentType<WorkbenchEditorComponentProps>;
  editorId: WorkbenchEditorId;
  isDirty?: (document: WorkbenchDocument, nextValue: string) => boolean;
  label: string;
  load?: (document: WorkbenchDocument) => Promise<WorkbenchDocument> | WorkbenchDocument;
  matches?: (document: WorkbenchDocument) => boolean;
  save?: (
    document: WorkbenchDocument,
    nextValue: string
  ) => Promise<WorkbenchDocument | null | void> | WorkbenchDocument | null | void;
  supportsPreview?: boolean;
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

export type WorkbenchResourceTarget =
  | { kind: "article"; articlePath: string; preferredEditorId?: WorkbenchEditorId }
  | { kind: "config"; configKind: ConfigDocumentKind; preferredEditorId?: WorkbenchEditorId }
  | { kind: "home" }
  | { kind: "themeAsset"; fileName: string; groupId: string; preferredEditorId?: WorkbenchEditorId }
  | { kind: "themeGroupConfig"; groupId: string; preferredEditorId?: WorkbenchEditorId };

export interface WorkbenchApi {
  hideCommandPalette: () => void;
  openConfigDocument: (kind: ConfigDocumentKind) => Promise<void>;
  openHome: () => void;
  openResource: (target: WorkbenchResourceTarget) => Promise<void>;
  publishStaticSite: () => Promise<void>;
  refreshWorkspaceData: (
    target: WorkbenchRefreshTarget | WorkbenchRefreshTarget[]
  ) => Promise<void>;
  revealLine: (lineNumber: number) => void;
  reopenActiveDocumentWithEditor: (editorId: WorkbenchEditorId) => void;
  saveActiveDocument: () => Promise<void>;
  setBusy: (message: string | null) => void;
  setTheme: (themeId: string) => void;
  showCommandPalette: () => void;
  showError: (message: string | null) => void;
  showReopenWithEditor: () => void;
  showThemePicker: () => void;
  startThemeGroupCreate: () => void;
  togglePreview: () => void;
  toggleSidebar: () => void;
}

export interface EditorActionApi {
  activeDocument: WorkbenchDocument | null;
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  monaco: typeof monacoEditor;
  snippets: EditorSnippet[];
}

export interface PasteHandlerApi {
  activeDocument: WorkbenchDocument | null;
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  event: ClipboardEvent;
  uploadClipboardImages: (
    articlePath: string,
    images: ClipboardImageInput[]
  ) => Promise<ClipboardImageResult[]>;
}

export interface PluginSetupContext {
  registerCommand: (command: CommandDefinition) => void;
  registerEditorAction: (action: EditorActionDefinition) => void;
  registerEditorContribution: (contribution: EditorContributionDefinition) => void;
  registerPasteHandler: (handler: PasteHandlerDefinition) => void;
  registerTheme: (theme: ThemeDefinition) => void;
  registerWorkbenchContribution: (contribution: WorkbenchContributionDefinition) => void;
}

export interface NormalizedSnippet extends EditorSnippet {
  environment: SnippetLanguageId;
  prefix: string[];
}

export interface NormalizedEditorConfig {
  keybindings: EditorKeybinding[];
  latexSnippets: NormalizedSnippet[];
  markdownSnippets: NormalizedSnippet[];
}
