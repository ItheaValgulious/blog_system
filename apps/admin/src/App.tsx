import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monacoEditor from "monaco-editor";
import "monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js";
import "katex/dist/katex.min.css";
import katexCssRaw from "katex/dist/katex.min.css?raw";
import "./monaco-environment";

import {
  extractMarkdownBlocks,
  highlightThemeCss,
  normalizeEditorConfig,
  parseArticleSource,
  renderMarkdownFragmentWithKatex,
  rewriteManagedMediaUrls,
  rewriteRelativeAssetUrls,
  type ArticleRecord,
  type EditorSnippet,
  type FileSystemNode
} from "@blog-system/content-core";

import {
  api,
  type EditorConfigPayload,
  type GitChangedFilePayload,
  type GitCommitPayload,
  type MediaAssetPayload,
  type RenderConfigPayload,
  type RenderStylePayload,
  type SiteConfigPayload,
  type SiteThemeConfigPayload,
  type TreePayload
} from "./api";
import { jsonSchemas } from "./editor-config-schema";
import { evaluateWhenClause, getActiveKeybinding, getMatchingKeybindings, matchesKeybindingEvent } from "./keybindings";
import { getSnippetsForLanguage, normalizeWorkbenchSnippets } from "./snippet-scope";
import { getSnippetLanguageAtOffset } from "./snippet-context";
import { builtInPlugins } from "./workbench/builtins";
import { PluginRuntime } from "./workbench/plugin-runtime";
import type {
  ArticleWorkbenchDocument,
  ClipboardImageInput,
  CreateDialogContributionDefinition,
  ConfigDocumentKind,
  ConfigWorkbenchDocument,
  NormalizedEditorConfig,
  NormalizedSnippet,
  RenderStyleWorkbenchDocument,
  SidebarViewContributionDefinition,
  SidebarViewId,
  WorkbenchApi,
  WorkbenchDocument
} from "./workbench/types";

loader.config({ monaco: monacoEditor });

const PREVIEW_UPDATE_DEBOUNCE_MS = 180;
const SIDEBAR_WIDTH_STORAGE_KEY = "admin-sidebar-width";
const PREVIEW_WIDTH_STORAGE_KEY = "admin-preview-width";

interface PreviewSourceParseResult {
  body: string;
  directory: string;
  frontmatterError: string | null;
}

interface ParsedPreviewBlock {
  hash: string;
  source: string;
  startLine: number;
  endLine: number;
}

interface RenderedPreviewBlock {
  id: string;
  hash: string;
  startLine: number;
  endLine: number;
  element: HTMLElement;
}

const CONFIG_DOCUMENT_META: Record<Exclude<ConfigDocumentKind, "siteConfig" | "siteThemeAtlas" | "renderConfig">, { title: string; path: string; read: (payload: EditorConfigPayload) => string }> = {
  markdownSnippets: {
    title: "markdown.snippets.json",
    path: "config/markdown.snippets.json",
    read: (payload) => payload.markdownSnippetsRaw
  },
  latexSnippets: {
    title: "latex.snippets.json",
    path: "config/latex.snippets.json",
    read: (payload) => payload.latexSnippetsRaw
  },
  keybindings: {
    title: "keybindings.json",
    path: "config/keybindings.json",
    read: (payload) => payload.keybindingsRaw
  }
};

const SITE_CONFIG_DOCUMENT_META = {
  title: "site.json",
  path: "config/site.json"
} as const;

const SITE_THEME_DOCUMENT_META = {
  title: "site-theme.atlas.json",
  path: "config/site-theme.atlas.json",
  themeId: "atlas"
} as const;

const RENDER_CONFIG_DOCUMENT_META = {
  title: "render.json",
  path: "config/render.json"
} as const;

function normalizeRenderStyleDirectory(value: string) {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/^config\/render\/+/i, "").replace(/^render\/+/i, "");

  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase().endsWith(".css") ? trimmed : `${trimmed}.css`;
}

function getRenderStyleDocumentPath(directory: string) {
  return `config/render/${directory}`;
}

function getRenderStyleTitle(directory: string) {
  return directory.split("/").pop() ?? directory;
}

function getDocumentPath(document: WorkbenchDocument | null, fallbackPath: string | null) {
  if (!document) {
    return fallbackPath ?? "";
  }

  if (document.kind === "article") {
    return document.articlePath;
  }

  if (document.kind === "renderStyle") {
    return document.editorPath;
  }

  return getConfigDocumentPath(document.configKind);
}

function ActivityIcon({ icon }: { icon: "explorer" | "edit" | "plugins" | "media" | "git" | "command" }) {
  const commonProps = {
    "aria-hidden": true,
    className: "activity-icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24"
  };

  switch (icon) {
    case "explorer":
      return (
        <svg {...commonProps}>
          <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <path d="M3.5 6.5v-1a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "edit":
      return (
        <svg {...commonProps}>
          <path d="M4.5 19.5h4l9.5-9.5-4-4L4.5 15.5z" />
          <path d="M12.5 7.5l4 4" />
          <path d="M4.5 19.5l3-1" />
        </svg>
      );
    case "plugins":
      return (
        <svg {...commonProps}>
          <path d="M10 4.5h4v5h5v5h-5v5h-4v-5H5v-5h5z" />
        </svg>
      );
    case "media":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M6.5 17l4.5-4.5 3.5 3.5 2-2 1.5 1.5" />
        </svg>
      );
    case "git":
      return (
        <svg {...commonProps}>
          <circle cx="8" cy="6.5" r="2" />
          <circle cx="16" cy="17.5" r="2" />
          <circle cx="16" cy="6.5" r="2" />
          <path d="M10 6.5h4" />
          <path d="M8 8.5v5a4 4 0 0 0 4 4h2" />
        </svg>
      );
    case "command":
      return (
        <svg {...commonProps}>
          <path d="M8.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0v9a2 2 0 1 1-4 0" />
          <path d="M19.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0v9a2 2 0 1 1-4 0" />
          <path d="M6.5 10.5h11" />
          <path d="M6.5 13.5h11" />
        </svg>
      );
  }
}

function getSidebarViewIcon(viewId: SidebarViewId) {
  switch (viewId) {
    case "explorer":
      return "explorer";
    case "edit":
      return "edit";
    case "plugins":
      return "plugins";
    case "media":
      return "media";
    case "git":
      return "git";
  }
}

const PREVIEW_SHADOW_BASE_CSS = `
html,
body {
  margin: 0;
  padding: 0;
}

body {
  color: var(--wb-foreground);
  font-family: "Georgia", serif;
  line-height: 1.8;
  background: transparent;
}

a {
  color: var(--wb-accent);
}

img {
  max-width: 100%;
  display: block;
  border-radius: 14px;
  border: 1px solid var(--wb-border);
}

pre {
  overflow: auto;
  padding: 16px;
  border-radius: 12px;
  background: #172028;
  border: 1px solid var(--wb-border);
  color: #d8e1eb;
}

code:not(pre code) {
  padding: 0.18em 0.38em;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 0.92em;
}

pre code {
  font-family: "Cascadia Code", "Fira Code", monospace;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid var(--wb-border);
  padding: 8px 10px;
  text-align: left;
}

blockquote {
  margin: 0;
  padding-left: 16px;
  border-left: 3px solid var(--wb-accent);
  color: var(--wb-foreground-muted);
}

hr {
  border: none;
  border-top: 1px solid var(--wb-border);
}

.preview-prose {
  line-height: 1.8;
}

.preview-block {
  scroll-margin-block: 35vh;
}

.preview-prose h1,
.preview-prose h2,
.preview-prose h3 {
  font-family: "Georgia", serif;
}

${highlightThemeCss}
${katexCssRaw}
`;

const emptyConfigPayload: EditorConfigPayload = {
  markdownSnippets: [],
  latexSnippets: [],
  keybindings: [],
  markdownSnippetsRaw: "[]\n",
  latexSnippetsRaw: "[]\n",
  keybindingsRaw: "[]\n",
  warnings: []
};

const DEFAULT_KEYBINDINGS = normalizeEditorConfig({
  snippets: [],
  keybindings: [
    {
      key: "Ctrl+S",
      command: "workbench.saveActiveDocument"
    },
    {
      key: "Ctrl+Shift+P",
      command: "workbench.action.showCommands"
    },
    {
      key: "F1",
      command: "workbench.action.showCommands"
    },
    {
      key: "Ctrl+B",
      command: "workbench.toggleSidebar"
    },
    {
      key: "Ctrl+Backslash",
      command: "workbench.togglePreview"
    },
    {
      key: "F22",
      command: "acceptSelectedSuggestion",
      when: "suggestWidgetVisible"
    }
  ]
}).keybindings;

function getConfigDocumentPath(kind: ConfigDocumentKind) {
  switch (kind) {
    case "siteConfig":
      return SITE_CONFIG_DOCUMENT_META.path;
    case "siteThemeAtlas":
      return SITE_THEME_DOCUMENT_META.path;
    case "renderConfig":
      return RENDER_CONFIG_DOCUMENT_META.path;
    default:
      return CONFIG_DOCUMENT_META[kind].path;
  }
}

function getConfigDocumentTitle(kind: ConfigDocumentKind) {
  switch (kind) {
    case "siteConfig":
      return SITE_CONFIG_DOCUMENT_META.title;
    case "siteThemeAtlas":
      return SITE_THEME_DOCUMENT_META.title;
    case "renderConfig":
      return RENDER_CONFIG_DOCUMENT_META.title;
    default:
      return CONFIG_DOCUMENT_META[kind].title;
  }
}

function getJsonSchemaDefinitions() {
  return [
    { uri: "inmemory://schemas/snippets.json", fileMatch: [CONFIG_DOCUMENT_META.markdownSnippets.path, CONFIG_DOCUMENT_META.latexSnippets.path], schema: jsonSchemas.snippetSchema as object },
    { uri: "inmemory://schemas/keybindings.json", fileMatch: [CONFIG_DOCUMENT_META.keybindings.path], schema: jsonSchemas.keybindingSchema as object },
    { uri: "inmemory://schemas/site.json", fileMatch: [SITE_CONFIG_DOCUMENT_META.path], schema: jsonSchemas.siteConfigSchema as object },
    { uri: "inmemory://schemas/render.json", fileMatch: [RENDER_CONFIG_DOCUMENT_META.path], schema: jsonSchemas.renderConfigSchema as object },
    { uri: "inmemory://schemas/site-theme.json", fileMatch: [SITE_THEME_DOCUMENT_META.path], schema: jsonSchemas.siteThemeConfigSchema as object }
  ];
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function parsePreviewBlocks(markdown: string): ParsedPreviewBlock[] {
  return extractMarkdownBlocks(markdown).map((block) => ({
    hash: `${hashText(block.source)}:${block.source.length}`,
    source: block.source,
    startLine: block.startLine,
    endLine: block.endLine
  }));
}

function computeBodyLineOffset(rawContent: string) {
  const normalized = rawContent.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return 0;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return 0;
  }

  const bodyStartIndex = closingIndex + 5;
  const linesBeforeBody = normalized.slice(0, bodyStartIndex).split("\n").length - 1;
  const rawBodyWithLeadingNewlines = normalized.slice(bodyStartIndex);
  const leadingNewlineCount = rawBodyWithLeadingNewlines.match(/^\n+/)?.[0].length ?? 0;

  return linesBeforeBody + leadingNewlineCount;
}

function findPreviewBlockByLine(blocks: RenderedPreviewBlock[], lineNumber: number) {
  for (const block of blocks) {
    if (lineNumber >= block.startLine && lineNumber <= block.endLine) {
      return block;
    }
  }

  return blocks.find((block) => block.startLine > lineNumber) ?? blocks[blocks.length - 1] ?? null;
}

function parsePreviewSource(articlePath: string, rawContent: string): PreviewSourceParseResult {
  try {
    const parsed = parseArticleSource(articlePath, rawContent);
    return {
      body: parsed.body,
      directory: parsed.directory,
      frontmatterError: null
    };
  } catch (error) {
    const normalizedPath = articlePath.replace(/\\/g, "/");
    const directory = normalizedPath.includes("/") ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/")) : "";
    const normalizedRawContent = rawContent.replace(/\r\n/g, "\n");
    const closingIndex = normalizedRawContent.startsWith("---\n")
      ? normalizedRawContent.indexOf("\n---\n", 4)
      : -1;
    const body =
      closingIndex === -1
        ? normalizedRawContent
        : normalizedRawContent.slice(closingIndex + 5).replace(/^\n+/, "");

    return {
      body,
      directory,
      frontmatterError: (error as Error).message
    };
  }
}

function isArticleDocument(document: WorkbenchDocument | null): document is ArticleWorkbenchDocument {
  return Boolean(document && document.kind === "article");
}

function isConfigDocument(document: WorkbenchDocument | null): document is ConfigWorkbenchDocument {
  return Boolean(document && document.kind === "config");
}

function isRenderStyleDocument(document: WorkbenchDocument | null): document is RenderStyleWorkbenchDocument {
  return Boolean(document && document.kind === "renderStyle");
}

function buildNormalizedEditorConfig(configPayload: EditorConfigPayload | null): NormalizedEditorConfig {
  const payload = configPayload ?? emptyConfigPayload;
  return {
    markdownSnippets: normalizeWorkbenchSnippets(payload.markdownSnippets, "markdown"),
    latexSnippets: normalizeWorkbenchSnippets(payload.latexSnippets, "latex"),
    keybindings: [...DEFAULT_KEYBINDINGS, ...normalizeEditorConfig({ snippets: [], keybindings: payload.keybindings }).keybindings]
  };
}

function buildConfigDocument(
  kind: ConfigDocumentKind,
  payload: EditorConfigPayload | SiteConfigPayload | SiteThemeConfigPayload | RenderConfigPayload
): ConfigWorkbenchDocument {
  const value =
    kind === "siteConfig"
      ? (payload as SiteConfigPayload).raw
      : kind === "siteThemeAtlas"
        ? (payload as SiteThemeConfigPayload).raw
        : kind === "renderConfig"
          ? (payload as RenderConfigPayload).raw
          : CONFIG_DOCUMENT_META[kind].read(payload as EditorConfigPayload);

  return {
    id: `config:${kind}`,
    kind: "config",
    configKind: kind,
    title: getConfigDocumentTitle(kind),
    language: "json",
    value,
    savedValue: value,
    dirty: false,
    previewable: false
  };
}

function buildArticleDocument(record: ArticleRecord): ArticleWorkbenchDocument {
  return {
    id: `article:${record.path}`,
    kind: "article",
    articlePath: record.path,
    record,
    title: record.title,
    language: "markdown",
    value: record.rawContent,
    savedValue: record.rawContent,
    dirty: false,
    previewable: true
  };
}

function buildRenderStyleDocument(payload: RenderStylePayload): RenderStyleWorkbenchDocument {
  return {
    id: `render-style:${payload.directory}`,
    kind: "renderStyle",
    directory: payload.directory,
    editorPath: getRenderStyleDocumentPath(payload.directory),
    title: getRenderStyleTitle(payload.directory),
    language: "css",
    value: payload.raw,
    savedValue: payload.raw,
    dirty: false,
    previewable: false
  };
}

function upsertDocument(documents: WorkbenchDocument[], nextDocument: WorkbenchDocument) {
  const index = documents.findIndex((document) => document.id === nextDocument.id);
  if (index === -1) {
    return [...documents, nextDocument];
  }
  const nextDocuments = [...documents];
  nextDocuments[index] = nextDocument;
  return nextDocuments;
}

function closeDocument(documents: WorkbenchDocument[], documentId: string) {
  return documents.filter((document) => document.id !== documentId);
}

function getParentPath(path: string) {
  const normalized = path.replace(/\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function getBaseName(path: string) {
  const normalized = path.replace(/\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

function matchesPathPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function replacePathPrefix(path: string, fromPrefix: string, toPrefix: string) {
  if (path === fromPrefix) {
    return toPrefix;
  }
  if (path.startsWith(`${fromPrefix}/`)) {
    return `${toPrefix}${path.slice(fromPrefix.length)}`;
  }
  return path;
}

function flattenTreePaths(nodes: TreePayload["tree"]): string[] {
  return nodes.flatMap((node) => (node.type === "directory" ? flattenTreePaths(node.children ?? []) : [node.path]));
}

function buildFileTreeMap(nodes: FileSystemNode[]) {
  const entries = new Map<string, FileSystemNode>();
  const visit = (node: FileSystemNode) => {
    entries.set(node.path, node);
    if (node.type === "directory") {
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return entries;
}

function filterFileTreeNode(node: FileSystemNode, searchQuery: string, selectedTag: string, selectedStatus: "all" | "draft" | "published") {
  const query = searchQuery.trim().toLowerCase();
  if (node.type === "directory") {
    return (
      query.length === 0 ||
      node.name.toLowerCase().includes(query) ||
      node.path.toLowerCase().includes(query) ||
      node.children.some((child) => filterFileTreeNode(child, searchQuery, selectedTag, selectedStatus))
    );
  }
  const article = node.article;
  const matchesQuery =
    query.length === 0 ||
    node.name.toLowerCase().includes(query) ||
    node.path.toLowerCase().includes(query) ||
    article?.title.toLowerCase().includes(query) ||
    article?.tags.some((tag) => tag.toLowerCase().includes(query));
  const matchesTag = !article || selectedTag === "all" || article.tags.includes(selectedTag);
  const matchesStatus = !article || selectedStatus === "all" || article.status === selectedStatus;
  return matchesQuery && matchesTag && matchesStatus;
}

function getSnippetLanguage(model: monacoEditor.editor.ITextModel, position: monacoEditor.Position) {
  return getSnippetLanguageAtOffset(model.getValue(), model.getOffsetAt(position));
}

function toSnippetBody(body: string | string[]) {
  return Array.isArray(body) ? body.join("\n") : body;
}

function getScopedSnippets(snippets: NormalizedSnippet[], languageId: "markdown" | "latex") {
  return getSnippetsForLanguage(snippets, languageId);
}

function getSymbolSuffix(value: string) {
  return /[^A-Za-z0-9_-]+$/.exec(value)?.[0] ?? "";
}

function isSymbolSnippetPrefix(prefix: string) {
  return /[^A-Za-z0-9_-]/.test(prefix);
}

function getSymbolTriggerCharacters(snippets: NormalizedSnippet[]) {
  return Array.from(
    new Set(
      snippets
        .flatMap((snippet) => snippet.prefix)
        .filter((prefix) => isSymbolSnippetPrefix(prefix))
        .map((prefix) => prefix.slice(-1))
        .filter(Boolean)
    )
  );
}

function buildPreviewRootCompatCss(rawCss: string) {
  return rawCss.replace(/(^|,)\s*:root\b/gm, "$1 :host, html");
}

function isWorkbenchKeybindingCommand(command: string) {
  return command === "workbench.action.showCommands" || command.startsWith("workbench.") || command.startsWith("blog.");
}

function isSuppressedDefaultEditorCommand(command: string, context: Record<string, unknown>) {
  switch (command) {
    case "acceptSelectedSuggestion":
      return context.suggestWidgetVisible === true;
    case "editor.action.triggerSuggest":
    case "editor.action.inlineSuggest.commit":
    case "editor.action.copyLinesDownAction":
    case "markdown.extension.onCopyLineDown":
    case "editor.action.copyLinesUpAction":
    case "markdown.extension.onCopyLineUp":
    case "editor.action.insertCursorAbove":
    case "editor.action.insertCursorBelow":
    case "workbench.action.quickOpen":
      return true;
    default:
      return false;
  }
}

function parseCommaSeparatedTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function deriveArticleFileName(title: string) {
  const normalized = title.trim().replace(/\s+/g, "-");
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function remapDocuments(documents: WorkbenchDocument[], fromPath: string, toPath: string) {
  return documents.map((document) => {
    if (document.kind !== "article") {
      return document;
    }
    const nextPath = replacePathPrefix(document.articlePath, fromPath, toPath);
    if (nextPath === document.articlePath) {
      return document;
    }
    return {
      ...document,
      id: `article:${nextPath}`,
      articlePath: nextPath,
      record: {
        ...document.record,
        path: nextPath,
        directory: getParentPath(nextPath),
        fileName: getBaseName(nextPath)
      }
    };
  });
}

function removeDocuments(documents: WorkbenchDocument[], targetPath: string) {
  return documents.filter((document) => document.kind !== "article" || !matchesPathPrefix(document.articlePath, targetPath));
}

function LoginView({
  busy,
  error,
  onLogin
}: {
  busy: boolean;
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("changeme123");

  return (
    <div className="login-shell">
      <div className="login-card">
        <div>
          <p className="title-overline">Knowledge Base Admin</p>
          <h1>Admin Workbench</h1>
          <p className="body-muted">Edit Markdown, manage files, configure snippets, and publish the site from one workbench.</p>
        </div>
        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await onLogin(username, password);
          }}
        >
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="action-button primary" disabled={busy} type="submit">
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CommandPalette({
  open,
  title,
  placeholder,
  query,
  selectedIndex,
  items,
  onQueryChange,
  onClose,
  onSelectIndex,
  onExecute
}: {
  open: boolean;
  title: string;
  placeholder: string;
  query: string;
  selectedIndex: number;
  items: Array<{ id: string; title: string; description?: string }>;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onExecute: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onSelectIndex(Math.min(selectedIndex + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            onSelectIndex(Math.max(selectedIndex - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const activeItem = items[selectedIndex];
            if (activeItem) {
              onExecute(activeItem.id);
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="command-palette-header">{title}</div>
        <input className="command-palette-input" placeholder={placeholder} ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} />
        <div className="command-palette-results">
          {items.length === 0 ? (
            <div className="command-item empty">No results.</div>
          ) : (
            items.map((item, index) => (
              <button className={`command-item ${index === selectedIndex ? "is-active" : ""}`} key={item.id} onClick={() => onExecute(item.id)} onMouseEnter={() => onSelectIndex(index)} type="button">
                <strong>{item.title}</strong>
                {item.description ? <span>{item.description}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarViewId>("explorer");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? 280));
  const [previewWidth, setPreviewWidth] = useState(() => Number(window.localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY) ?? 420));
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] = useState<"commands" | "themes">("commands");
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [treePayload, setTreePayload] = useState<TreePayload | null>(null);
  const [configPayload, setConfigPayload] = useState<EditorConfigPayload | null>(null);
  const [renderConfigPayload, setRenderConfigPayload] = useState<RenderConfigPayload | null>(null);
  const [siteConfigPayload, setSiteConfigPayload] = useState<SiteConfigPayload | null>(null);
  const [siteThemeConfigPayload, setSiteThemeConfigPayload] = useState<SiteThemeConfigPayload | null>(null);
  const [documents, setDocuments] = useState<WorkbenchDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaAssets, setMediaAssets] = useState<MediaAssetPayload[]>([]);
  const [gitChangedFiles, setGitChangedFiles] = useState<GitChangedFilePayload[]>([]);
  const [gitCommits, setGitCommits] = useState<GitCommitPayload[]>([]);
  const [gitCommitMessage, setGitCommitMessage] = useState("Update content and assets");
  const [gitInitialized, setGitInitialized] = useState(true);
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [previewRenderDialogOpen, setPreviewRenderDialogOpen] = useState(false);
  const [renderStyleAssetVersion, setRenderStyleAssetVersion] = useState(0);
  const [themeId, setThemeId] = useState(() => window.localStorage.getItem("admin-theme") ?? "eva-dark");
  const [disabledPluginIds, setDisabledPluginIds] = useState<string[]>(() => {
    try {
      const rawValue = window.localStorage.getItem("admin-disabled-plugins");
      return rawValue ? (JSON.parse(rawValue) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ path: string; x: number; y: number } | null>(null);
  const [treeClipboard, setTreeClipboard] = useState<{ path: string; mode: "copy" | "move" } | null>(null);
  const [fileDialog, setFileDialog] = useState<{
    entryType: "file" | "directory";
    fileKind?: "article" | "asset";
    mode: "create-file" | "create-directory" | "rename" | "delete";
    path: string;
    value: string;
    metadata: Record<string, string>;
  } | null>(null);
  const [previewSourceText, setPreviewSourceText] = useState("");
  const [editorReadyVersion, setEditorReadyVersion] = useState(0);
  const [previewReadyVersion, setPreviewReadyVersion] = useState(0);
  const deferredCommandQuery = useDeferredValue(commandQuery);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewShadowHeadRef = useRef<HTMLDivElement | null>(null);
  const previewProseRef = useRef<HTMLDivElement | null>(null);
  const previewBlocksRef = useRef<RenderedPreviewBlock[]>([]);
  const previewBlockIdRef = useRef(0);
  const previewCursorSyncRafRef = useRef<number | null>(null);
  const schedulePreviewCursorSyncRef = useRef<(() => void) | null>(null);
  const previewUpdateTimerRef = useRef<number | null>(null);
  const previewRenderRequestRef = useRef(0);
  const draftValuesRef = useRef<Record<string, string>>({});
  const workbenchApiRef = useRef<WorkbenchApi | null>(null);
  const treeRootRef = useRef<HTMLDivElement | null>(null);

  const enabledPlugins = useMemo(() => builtInPlugins.filter((plugin) => !disabledPluginIds.includes(plugin.id)), [disabledPluginIds]);
  const pluginRuntime = useMemo(() => {
    const runtime = new PluginRuntime();
    runtime.activate(enabledPlugins);
    return runtime;
  }, [enabledPlugins]);
  const activeDocument = useMemo(() => documents.find((document) => document.id === activeDocumentId) ?? null, [documents, activeDocumentId]);
  const normalizedConfig = useMemo(() => buildNormalizedEditorConfig(configPayload), [configPayload]);
  const fileTreeMap = useMemo(() => buildFileTreeMap(treePayload?.fileTree ?? []), [treePayload?.fileTree]);
  const selectedTreeNode = selectedTreePath ? fileTreeMap.get(selectedTreePath) ?? null : null;
  const contextTargetNode = contextMenuState?.path ? fileTreeMap.get(contextMenuState.path) ?? null : null;
  const availableCommands = useMemo(() => pluginRuntime.getCommands(), [pluginRuntime]);
  const availableThemes = useMemo(() => pluginRuntime.getThemes(), [pluginRuntime]);
  const sidebarViewContributions = useMemo(
    () =>
      pluginRuntime
        .getWorkbenchContributions()
        .filter((contribution): contribution is SidebarViewContributionDefinition => contribution.kind === "sidebar-view"),
    [pluginRuntime]
  );
  const createDialogContributions = useMemo(
    () =>
      pluginRuntime
        .getWorkbenchContributions()
        .filter((contribution): contribution is CreateDialogContributionDefinition => contribution.kind === "create-dialog"),
    [pluginRuntime]
  );
  const activeTheme = pluginRuntime.getTheme(themeId) ?? availableThemes[0] ?? null;
  const previewRenderStyles = useMemo(
    () => renderConfigPayload?.value.styles ?? [],
    [renderConfigPayload]
  );
  const commandItems = useMemo(() => {
    const query = deferredCommandQuery.trim().toLowerCase();
    const renderStyleQueryCandidate = deferredCommandQuery.trim();
    const requestedRenderStyleDirectory =
      renderStyleQueryCandidate.length > 0 &&
      (!renderStyleQueryCandidate.includes(" ") ||
        renderStyleQueryCandidate.toLowerCase().endsWith(".css") ||
        renderStyleQueryCandidate.includes("/") ||
        renderStyleQueryCandidate.includes("\\"))
        ? normalizeRenderStyleDirectory(renderStyleQueryCandidate)
        : null;
    const base = availableCommands.map((command) => ({
      id: command.id,
      title: command.title,
      description: command.keywords?.join(", "),
      haystack: `${command.title} ${command.id} ${(command.keywords ?? []).join(" ")}`.toLowerCase()
    }));
    const filtered = query ? base.filter((command) => command.haystack.includes(query)) : base;
    const renderStyleCommand =
      requestedRenderStyleDirectory && query
        ? [
            {
              id: `render-style:create:${requestedRenderStyleDirectory}`,
              title: (renderConfigPayload?.value.styles.some(
                (style) => style.directory.toLowerCase() === requestedRenderStyleDirectory.toLowerCase()
              ) ?? false)
                ? `Open Render CSS: ${requestedRenderStyleDirectory}`
                : `Create Render CSS: ${requestedRenderStyleDirectory}`,
              description: `Edit config/render/${requestedRenderStyleDirectory}`,
              haystack: requestedRenderStyleDirectory.toLowerCase()
            }
          ]
        : [];

    return [...renderStyleCommand, ...filtered];
  }, [availableCommands, deferredCommandQuery, renderConfigPayload]);
  const themeItems = useMemo(() => {
    const query = deferredCommandQuery.trim().toLowerCase();
    const base = availableThemes.map((theme) => ({
      id: theme.id,
      title: theme.label,
      description: theme.appearance === "dark" ? "Dark theme" : "Light theme",
      haystack: `${theme.label} ${theme.id} ${theme.appearance}`.toLowerCase()
    }));
    return query ? base.filter((theme) => theme.haystack.includes(query)) : base;
  }, [availableThemes, deferredCommandQuery]);
  const paletteItems = commandPaletteMode === "commands" ? commandItems : themeItems;
  const activeMetadataDialogFields = useMemo(() => {
    if (!fileDialog || fileDialog.mode === "delete") {
      return [];
    }

    const entryType = fileDialog.entryType;
    return createDialogContributions.flatMap((contribution) =>
      contribution.fields.filter(
        (field) => field.appliesTo === "both" || field.appliesTo === entryType
      )
    );
  }, [createDialogContributions, fileDialog]);
  const getCreateDialogMetadataDefaults = useCallback(
    (entryType: "file" | "directory") => {
      const defaults: Record<string, string> = {};

      for (const contribution of createDialogContributions) {
        for (const field of contribution.fields) {
          if (field.appliesTo !== "both" && field.appliesTo !== entryType) {
            continue;
          }

          defaults[field.id] = field.defaultValue ?? "";
        }
      }

      return defaults;
    },
    [createDialogContributions]
  );

  const syncEditorValuePreservingView = useCallback((nextValue: string) => {
    const editor = editorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || model.getValue() === nextValue) {
      return;
    }

    const selectionOffsets = (editor.getSelections() ?? []).map((selection) => ({
      selectionStartOffset: model.getOffsetAt({
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn
      }),
      positionOffset: model.getOffsetAt(selection.getPosition())
    }));
    const scrollTop = editor.getScrollTop();
    const scrollLeft = editor.getScrollLeft();
    editor.setValue(nextValue);
    const nextModel = editor.getModel();

    if (nextModel && selectionOffsets.length > 0) {
      editor.setSelections(
        selectionOffsets.map(({ selectionStartOffset, positionOffset }) => {
          const nextSelectionStart = nextModel.getPositionAt(
            Math.min(selectionStartOffset, nextValue.length)
          );
          const nextPosition = nextModel.getPositionAt(Math.min(positionOffset, nextValue.length));

          return new monacoEditor.Selection(
            nextSelectionStart.lineNumber,
            nextSelectionStart.column,
            nextPosition.lineNumber,
            nextPosition.column
          );
        })
      );
    }

    editor.setScrollTop(scrollTop);
    editor.setScrollLeft(scrollLeft);
    editor.focus();
  }, []);

  const openRenameDialog = useCallback(
    async (targetNode: FileSystemNode) => {
      const baseMetadata =
        targetNode.type === "file" && targetNode.fileKind === "article" && targetNode.article
          ? {
              tags: targetNode.article.tags.join(", "),
              top: String(targetNode.article.top)
            }
          : {};

      const metadataPayload =
        targetNode.type === "directory"
          ? await api.getFileSystemMetadata(targetNode.path)
          : targetNode.type === "file" && targetNode.fileKind === "article"
            ? await api.getFileSystemMetadata(targetNode.path)
            : null;

      setFileDialog({
        entryType: targetNode.type === "directory" ? "directory" : "file",
        fileKind: targetNode.type === "file" ? targetNode.fileKind : undefined,
        mode: "rename",
        path: targetNode.path,
        value:
          targetNode.type === "file" && targetNode.fileKind === "article" && metadataPayload?.metadata.title
            ? String(metadataPayload.metadata.title)
            : targetNode.name,
        metadata: {
          ...getCreateDialogMetadataDefaults(targetNode.type === "directory" ? "directory" : "file"),
          ...baseMetadata,
          ...(metadataPayload?.metadata.tags
            ? { tags: Array.isArray(metadataPayload.metadata.tags) ? metadataPayload.metadata.tags.join(", ") : String(metadataPayload.metadata.tags) }
            : {}),
          ...(metadataPayload?.metadata.top !== undefined ? { top: String(metadataPayload.metadata.top) } : {})
        }
      });
    },
    [getCreateDialogMetadataDefaults]
  );
  const selectedTags = treePayload?.tags ?? [];

  const getDraftValue = useCallback(
    (document: WorkbenchDocument) => draftValuesRef.current[document.id] ?? document.savedValue,
    []
  );

  const attachPreviewRef = useCallback((node: HTMLDivElement | null) => {
    previewRef.current = node;
    setPreviewReadyVersion((current) => current + 1);
  }, []);

  const attachPreviewSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      previewShadowHeadRef.current = null;
      previewProseRef.current = null;
      previewBlocksRef.current = [];
      setPreviewReadyVersion((current) => current + 1);
      return;
    }

    const shadowRoot = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    const baseStyle = document.createElement("style");
    baseStyle.textContent = PREVIEW_SHADOW_BASE_CSS;

    const externalStylesHost = document.createElement("div");
    const htmlElement = document.createElement("html");
    const bodyElement = document.createElement("body");
    const proseElement = document.createElement("div");
    proseElement.className = "preview-prose";
    bodyElement.appendChild(proseElement);
    htmlElement.appendChild(bodyElement);

    shadowRoot.replaceChildren(baseStyle, externalStylesHost, htmlElement);
    previewShadowHeadRef.current = externalStylesHost;
    previewProseRef.current = proseElement;
    previewBlocksRef.current = [];
    setPreviewReadyVersion((current) => current + 1);
  }, []);

  const schedulePreviewSourceUpdate = useCallback((nextValue: string, options?: { immediate?: boolean }) => {
    if (previewUpdateTimerRef.current !== null) {
      window.clearTimeout(previewUpdateTimerRef.current);
      previewUpdateTimerRef.current = null;
    }

    if (options?.immediate) {
      setPreviewSourceText(nextValue);
      return;
    }

    previewUpdateTimerRef.current = window.setTimeout(() => {
      setPreviewSourceText(nextValue);
      previewUpdateTimerRef.current = null;
    }, PREVIEW_UPDATE_DEBOUNCE_MS);
  }, []);

  const openPalette = (mode: "commands" | "themes") => {
    setCommandPaletteMode(mode);
    setCommandQuery("");
    setSelectedPaletteIndex(0);
    setCommandPaletteOpen(true);
  };

  const startResize = useCallback(
    (mode: "sidebar" | "preview", startClientX: number) => {
      const initialSidebarWidth = sidebarWidth;
      const initialPreviewWidth = previewWidth;

      const handlePointerMove = (event: PointerEvent) => {
        if (mode === "sidebar") {
          setSidebarWidth(Math.max(220, Math.min(520, initialSidebarWidth + (event.clientX - startClientX))));
        } else {
          setPreviewWidth(Math.max(280, Math.min(760, initialPreviewWidth - (event.clientX - startClientX))));
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [previewWidth, sidebarWidth]
  );

  const loadTree = async () => {
    const payload = await api.getTree();
    startTransition(() => {
      setTreePayload(payload);
    });
    return payload;
  };

  const loadConfig = async () => {
    const payload = await api.getEditorConfig();
    startTransition(() => {
      setConfigPayload(payload);
    });
    return payload;
  };

  const loadRenderConfig = async () => {
    const payload = await api.getRenderConfig();
    startTransition(() => {
      setRenderConfigPayload(payload);
    });
    return payload;
  };

  const loadSiteConfig = async () => {
    const payload = await api.getSiteConfig();
    startTransition(() => {
      setSiteConfigPayload(payload);
    });
    return payload;
  };

  const loadSiteThemeConfig = async () => {
    const payload = await api.getSiteThemeConfig(SITE_THEME_DOCUMENT_META.themeId);
    startTransition(() => {
      setSiteThemeConfigPayload(payload);
    });
    return payload;
  };

  const loadMediaAssets = async () => {
    const payload = await api.listMediaAssets();
    startTransition(() => {
      setMediaAssets(payload.assets);
    });
    return payload.assets;
  };

  const loadGitData = async () => {
    const [statusPayload, historyPayload] = await Promise.all([api.getGitStatus(), api.getGitHistory()]);
    startTransition(() => {
      setGitChangedFiles(statusPayload.files);
      setGitCommits(historyPayload.commits);
      setGitInitialized(statusPayload.initialized && historyPayload.initialized);
    });
  };

  const uploadMediaFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setBusyMessage("Uploading media...");
    try {
      const images = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<{ mimeType: string; base64Data: string; fileName: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === "string" ? reader.result : "";
                resolve({
                  mimeType: file.type,
                  base64Data: result.split(",")[1] ?? "",
                  fileName: file.name
                });
              };
              reader.onerror = () => reject(reader.error ?? new Error("Failed to read media file."));
              reader.readAsDataURL(file);
            })
        )
      );

      await api.uploadMediaAssets(images);
      await Promise.all([loadMediaAssets(), loadGitData()]);
      setPageError(null);
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const openArticleDocument = async (articlePath: string) => {
    const existingDocument = documents.find((document) => document.kind === "article" && document.articlePath === articlePath);
    if (existingDocument) {
      setActiveDocumentId(existingDocument.id);
      setSelectedTreePath(articlePath);
      return;
    }
    const article = await api.getArticle(articlePath);
    const articleDocument = buildArticleDocument(article);
    draftValuesRef.current[articleDocument.id] = articleDocument.value;
    setDocuments((current) => upsertDocument(current, articleDocument));
    setActiveDocumentId(articleDocument.id);
    setSelectedTreePath(articlePath);
  };

  const applySavedRenderConfigPayload = (savedPayload: RenderConfigPayload) => {
    setRenderConfigPayload(savedPayload);
    setDocuments((current) =>
      current.map((document) =>
        document.kind === "config" && document.configKind === "renderConfig"
          ? {
              ...document,
              value: savedPayload.raw,
              savedValue: savedPayload.raw,
              dirty: false
            }
          : document
      )
    );
    draftValuesRef.current["config:renderConfig"] = savedPayload.raw;
    if (activeDocument?.kind === "config" && activeDocument.configKind === "renderConfig") {
      syncEditorValuePreservingView(savedPayload.raw);
    }
    setRenderStyleAssetVersion((current) => current + 1);
  };

  const applySavedRenderStylePayload = (savedPayload: RenderStylePayload) => {
    const savedDocument = buildRenderStyleDocument(savedPayload);
    draftValuesRef.current[savedDocument.id] = savedDocument.value;
    setDocuments((current) => upsertDocument(current, savedDocument));
    setActiveDocumentId(savedDocument.id);
    if (activeDocument?.kind === "renderStyle" && activeDocument.directory === savedPayload.directory) {
      syncEditorValuePreservingView(savedPayload.raw);
    }
    setRenderStyleAssetVersion((current) => current + 1);
  };

  const openRenderStyleDocument = async (directory: string) => {
    const normalizedDirectory = normalizeRenderStyleDirectory(directory);

    if (!normalizedDirectory) {
      return;
    }

    try {
      const existingDocument = documents.find(
        (document) => document.kind === "renderStyle" && document.directory === normalizedDirectory
      );
      if (existingDocument) {
        setActiveDocumentId(existingDocument.id);
        return;
      }

      const payload = await api.getRenderStyle(normalizedDirectory);
      const renderStyleDocument = buildRenderStyleDocument(payload);
      draftValuesRef.current[renderStyleDocument.id] = renderStyleDocument.value;
      setDocuments((current) => upsertDocument(current, renderStyleDocument));
      setActiveDocumentId(renderStyleDocument.id);
      setPageError(null);
    } catch (error) {
      setPageError((error as Error).message);
    }
  };

  const createRenderStyleDocument = async (fileName: string) => {
    const normalizedDirectory = normalizeRenderStyleDirectory(fileName);

    if (!normalizedDirectory) {
      return;
    }

    setBusyMessage(`Opening ${normalizedDirectory}...`);
    try {
      const payload = await api.createRenderStyle(normalizedDirectory);
      applySavedRenderConfigPayload(payload.renderConfig);
      applySavedRenderStylePayload({
        directory: payload.directory,
        raw: payload.raw
      });
      setPageError(null);
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const openConfigDocument = async (kind: ConfigDocumentKind) => {
    const existingDocument = documents.find((document) => document.kind === "config" && document.configKind === kind);
    if (existingDocument) {
      setActiveDocumentId(existingDocument.id);
      return;
    }
    const payload =
      kind === "siteConfig"
        ? siteConfigPayload ?? (await loadSiteConfig())
        : kind === "renderConfig"
          ? renderConfigPayload ?? (await loadRenderConfig())
        : kind === "siteThemeAtlas"
          ? siteThemeConfigPayload ?? (await loadSiteThemeConfig())
        : configPayload ?? (await loadConfig());
    const document = buildConfigDocument(kind, payload);
    draftValuesRef.current[document.id] = document.value;
    setDocuments((current) => upsertDocument(current, document));
    setActiveDocumentId(document.id);
  };

  const saveRenderConfigRaw = async (raw: string) => {
    const savedPayload = await api.saveRenderConfig(raw);
    applySavedRenderConfigPayload(savedPayload);
    return savedPayload;
  };

  const refreshWorkspace = async () => {
    const [tree] = await Promise.all([loadTree(), loadConfig(), loadRenderConfig(), loadSiteConfig(), loadSiteThemeConfig(), loadMediaAssets(), loadGitData()]);
    if (!activeDocumentId) {
      const firstArticlePath = flattenTreePaths(tree.tree)[0];
      if (firstArticlePath) {
        await openArticleDocument(firstArticlePath);
      }
    }
  };

  const saveConfigDocuments = async () => {
    const markdownSnippetsDocument = documents.find((document) => document.kind === "config" && document.configKind === "markdownSnippets");
    const latexSnippetsDocument = documents.find((document) => document.kind === "config" && document.configKind === "latexSnippets");
    const keybindingsDocument = documents.find((document) => document.kind === "config" && document.configKind === "keybindings");
    const savedPayload = await api.saveEditorConfig(
      (markdownSnippetsDocument ? getDraftValue(markdownSnippetsDocument) : undefined) ?? configPayload?.markdownSnippetsRaw ?? emptyConfigPayload.markdownSnippetsRaw,
      (latexSnippetsDocument ? getDraftValue(latexSnippetsDocument) : undefined) ?? configPayload?.latexSnippetsRaw ?? emptyConfigPayload.latexSnippetsRaw,
      (keybindingsDocument ? getDraftValue(keybindingsDocument) : undefined) ?? configPayload?.keybindingsRaw ?? emptyConfigPayload.keybindingsRaw
    );
    setConfigPayload(savedPayload);
    setDocuments((current) =>
      current.map((document) => {
        if (
          document.kind !== "config" ||
          (document.configKind !== "markdownSnippets" &&
            document.configKind !== "latexSnippets" &&
            document.configKind !== "keybindings")
        ) {
          return document;
        }
        const nextValue = CONFIG_DOCUMENT_META[document.configKind].read(savedPayload);
        return { ...document, value: nextValue, savedValue: nextValue, dirty: false };
      })
    );
    draftValuesRef.current["config:markdownSnippets"] = savedPayload.markdownSnippetsRaw;
    draftValuesRef.current["config:latexSnippets"] = savedPayload.latexSnippetsRaw;
    draftValuesRef.current["config:keybindings"] = savedPayload.keybindingsRaw;
  };

  const saveSiteConfigDocument = async () => {
    const siteConfigDocument = documents.find(
      (document) => document.kind === "config" && document.configKind === "siteConfig"
    );
    const raw = (siteConfigDocument ? getDraftValue(siteConfigDocument) : undefined) ?? siteConfigPayload?.raw;

    if (typeof raw !== "string") {
      return;
    }

    const savedPayload = await api.saveSiteConfig(raw);
    setSiteConfigPayload(savedPayload);
    setDocuments((current) =>
      current.map((document) =>
        document.kind === "config" && document.configKind === "siteConfig"
          ? {
              ...document,
              value: savedPayload.raw,
              savedValue: savedPayload.raw,
              dirty: false
            }
          : document
      )
    );
    draftValuesRef.current["config:siteConfig"] = savedPayload.raw;
  };

  const saveSiteThemeConfigDocument = async () => {
    const siteThemeDocument = documents.find(
      (document) => document.kind === "config" && document.configKind === "siteThemeAtlas"
    );
    const raw = (siteThemeDocument ? getDraftValue(siteThemeDocument) : undefined) ?? siteThemeConfigPayload?.raw;

    if (typeof raw !== "string") {
      return;
    }

    const savedPayload = await api.saveSiteThemeConfig(SITE_THEME_DOCUMENT_META.themeId, raw);
    setSiteThemeConfigPayload(savedPayload);
    setDocuments((current) =>
      current.map((document) =>
        document.kind === "config" && document.configKind === "siteThemeAtlas"
          ? {
              ...document,
              value: savedPayload.raw,
              savedValue: savedPayload.raw,
              dirty: false
            }
          : document
      )
    );
    draftValuesRef.current["config:siteThemeAtlas"] = savedPayload.raw;
  };

  const saveRenderConfigDocument = async () => {
    const renderConfigDocument = documents.find(
      (document) => document.kind === "config" && document.configKind === "renderConfig"
    );
    const raw = (renderConfigDocument ? getDraftValue(renderConfigDocument) : undefined) ?? renderConfigPayload?.raw;

    if (typeof raw !== "string") {
      return;
    }

    await saveRenderConfigRaw(raw);
  };

  const saveRenderStyleDocument = async () => {
    if (!isRenderStyleDocument(activeDocument)) {
      return;
    }

    const raw = editorRef.current?.getValue() ?? getDraftValue(activeDocument);
    const savedPayload = await api.saveRenderStyle(activeDocument.directory, raw);
    applySavedRenderStylePayload(savedPayload);
  };

  const toggleRenderStyleEnable = async (directory: string, enable: boolean) => {
    const renderConfigDocument = documents.find(
      (document) => document.kind === "config" && document.configKind === "renderConfig"
    );
    const raw = (renderConfigDocument ? getDraftValue(renderConfigDocument) : undefined) ?? renderConfigPayload?.raw;
    const normalizedDirectory = normalizeRenderStyleDirectory(directory);

    if (!normalizedDirectory || typeof raw !== "string") {
      return;
    }

    setBusyMessage("Updating render CSS...");

    try {
      const parsed = JSON.parse(raw) as { styles?: Array<{ directory?: string; enable?: boolean }> };
      const currentStyles = Array.isArray(parsed.styles) ? parsed.styles : [];
      const nextStyles = currentStyles.some(
        (style) =>
          typeof style.directory === "string" &&
          style.directory.trim().toLowerCase() === normalizedDirectory.toLowerCase()
      )
        ? currentStyles.map((style) =>
            typeof style.directory === "string" &&
            style.directory.trim().toLowerCase() === normalizedDirectory.toLowerCase()
              ? {
                  directory: style.directory.trim().replace(/\\/g, "/"),
                  enable
                }
              : {
                  directory: typeof style.directory === "string" ? style.directory.trim().replace(/\\/g, "/") : "",
                  enable: style.enable === true
                }
          )
        : [
            ...currentStyles.map((style) => ({
              directory: typeof style.directory === "string" ? style.directory.trim().replace(/\\/g, "/") : "",
              enable: style.enable === true
            })),
            {
              directory: normalizedDirectory,
              enable
            }
          ];

      await saveRenderConfigRaw(
        JSON.stringify(
          {
            styles: nextStyles.filter((style) => style.directory.length > 0)
          },
          null,
          2
        )
      );
      setPageError(null);
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const saveActiveDocument = async () => {
    if (!activeDocument) {
      return;
    }
    setBusyMessage(`Saving ${activeDocument.title}...`);
    try {
      if (activeDocument.kind === "article") {
        const currentValue = editorRef.current?.getValue() ?? getDraftValue(activeDocument);
        const savedArticle = await api.saveArticle(activeDocument.articlePath, currentValue);
        const savedDocument = buildArticleDocument(savedArticle);
        draftValuesRef.current[savedDocument.id] = savedDocument.value;
        setDocuments((current) => upsertDocument(current, savedDocument));
        setActiveDocumentId(savedDocument.id);
        syncEditorValuePreservingView(savedDocument.value);
        schedulePreviewSourceUpdate(savedDocument.value, { immediate: true });
        await loadTree();
      } else if (activeDocument.kind === "renderStyle") {
        await saveRenderStyleDocument();
      } else if (activeDocument.configKind === "siteConfig") {
        await saveSiteConfigDocument();
      } else if (activeDocument.configKind === "renderConfig") {
        await saveRenderConfigDocument();
      } else if (activeDocument.configKind === "siteThemeAtlas") {
        await saveSiteThemeConfigDocument();
      } else {
        await saveConfigDocuments();
      }
      setPageError(null);
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const publishStaticSite = async () => {
    setBusyMessage("Publishing static site...");
    try {
      const result = await api.publishSite();
      setPageError(result.stderr || null);
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setBusyMessage(null);
    }
  };

  workbenchApiRef.current = {
    showCommandPalette: () => openPalette("commands"),
    hideCommandPalette: () => setCommandPaletteOpen(false),
    showThemePicker: () => openPalette("themes"),
    toggleSidebar: () => setSidebarVisible((current) => !current),
    togglePreview: () => setPreviewVisible((current) => !current),
    saveActiveDocument,
    openConfigDocument,
    publishStaticSite,
    setTheme: setThemeId
  };

  useEffect(() => {
    window.localStorage.setItem("admin-disabled-plugins", JSON.stringify(disabledPluginIds));
  }, [disabledPluginIds]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(previewWidth));
  }, [previewWidth]);

  useEffect(() => {
    const previewShadowHead = previewShadowHeadRef.current;

    if (!previewShadowHead) {
      return;
    }

    let cancelled = false;
    const enabledStyles = previewRenderStyles.filter((style) => style.enable);
    const nextLinks = enabledStyles.map((style) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/render-files/${style.directory
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/")}?v=${renderStyleAssetVersion}`;
      link.dataset.renderStyleDirectory = style.directory;
      return link;
    });
    previewShadowHead.replaceChildren(...nextLinks);

    void Promise.all(
      enabledStyles.map(async (style) => {
        const href = `/render-files/${style.directory
          .split("/")
          .filter(Boolean)
          .map((segment) => encodeURIComponent(segment))
          .join("/")}?v=${renderStyleAssetVersion}`;
        const response = await fetch(href, { credentials: "include" });
        const cssText = await response.text();
        const styleElement = document.createElement("style");
        styleElement.dataset.renderStyleRootCompat = style.directory;
        styleElement.textContent = buildPreviewRootCompatCss(cssText);
        return styleElement;
      })
    )
      .then((compatStyles) => {
        if (cancelled || previewShadowHeadRef.current !== previewShadowHead) {
          return;
        }

        previewShadowHead.replaceChildren(...nextLinks, ...compatStyles);
      })
      .catch(() => {
        if (!cancelled && previewShadowHeadRef.current === previewShadowHead) {
          previewShadowHead.replaceChildren(...nextLinks);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewReadyVersion, previewRenderStyles, renderStyleAssetVersion]);

  useEffect(() => {
    if (!activeTheme) {
      return;
    }
    window.localStorage.setItem("admin-theme", activeTheme.id);
    document.documentElement.dataset.themeAppearance = activeTheme.appearance;
    Object.entries(activeTheme.cssVariables).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    monacoEditor.editor.defineTheme(activeTheme.id, activeTheme.monacoTheme);
    monacoEditor.editor.setTheme(activeTheme.id);
  }, [activeTheme]);

  useEffect(() => {
    if (selectedPaletteIndex >= paletteItems.length) {
      setSelectedPaletteIndex(Math.max(0, paletteItems.length - 1));
    }
  }, [paletteItems.length, selectedPaletteIndex]);

  useEffect(() => {
    if (authenticated) {
      refreshWorkspace().catch((error: Error) => setPageError(error.message));
    }
  }, [authenticated]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setCommandQuery("");
      setSelectedPaletteIndex(0);
      setCommandPaletteMode("commands");
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!previewVisible || !isArticleDocument(activeDocument)) {
      setPreviewRenderDialogOpen(false);
    }
  }, [activeDocument, previewVisible]);

  useEffect(() => {
    if (!activeDocument || activeDocument.kind !== "article") {
      schedulePreviewSourceUpdate("", { immediate: true });
      return;
    }

    if (!previewVisible) {
      return;
    }

    schedulePreviewSourceUpdate(getDraftValue(activeDocument), { immediate: true });
  }, [activeDocument?.id, activeDocument?.savedValue, getDraftValue, previewVisible]);

  useEffect(() => {
    const previewRoot = previewProseRef.current;
    const requestId = previewRenderRequestRef.current + 1;
    previewRenderRequestRef.current = requestId;

    if (!previewRoot || !activeDocument || activeDocument.kind !== "article" || !previewVisible) {
      previewRoot?.replaceChildren();
      previewBlocksRef.current = [];
      setPageError((current) => (current && current.includes("end of the stream") ? null : current));
      return;
    }

    const parsedSource = parsePreviewSource(activeDocument.articlePath, previewSourceText);
    const bodyLineOffset = computeBodyLineOffset(previewSourceText);
    const nextBlocks = parsePreviewBlocks(parsedSource.body).map((block) => ({
      ...block,
      startLine: block.startLine + bodyLineOffset,
      endLine: block.endLine + bodyLineOffset
    }));
    const currentBlocks = previewBlocksRef.current;

    let prefixLength = 0;
    while (
      prefixLength < currentBlocks.length &&
      prefixLength < nextBlocks.length &&
      currentBlocks[prefixLength].hash === nextBlocks[prefixLength].hash
    ) {
      prefixLength += 1;
    }

    let currentTailIndex = currentBlocks.length - 1;
    let nextTailIndex = nextBlocks.length - 1;
    while (
      currentTailIndex >= prefixLength &&
      nextTailIndex >= prefixLength &&
      currentBlocks[currentTailIndex].hash === nextBlocks[nextTailIndex].hash
    ) {
      currentTailIndex -= 1;
      nextTailIndex -= 1;
    }

    const changedBlocks = nextBlocks.slice(prefixLength, nextTailIndex + 1);

    Promise.all(
      changedBlocks.map(async (block) => {
        const html = await renderMarkdownFragmentWithKatex(block.source);
        return rewriteManagedMediaUrls(
          rewriteRelativeAssetUrls(html, parsedSource.directory, "/content-files"),
          "/media"
        );
      })
    )
      .then((changedHtmlBlocks) => {
        if (previewRenderRequestRef.current !== requestId || !previewProseRef.current) {
          return;
        }

        const nextRenderedBlocks: RenderedPreviewBlock[] = [];

        for (let index = 0; index < prefixLength; index += 1) {
          const previousBlock = currentBlocks[index];
          const nextBlock = nextBlocks[index];
          nextRenderedBlocks.push({
            ...previousBlock,
            hash: nextBlock.hash,
            startLine: nextBlock.startLine,
            endLine: nextBlock.endLine
          });
        }

        for (let index = 0; index < changedBlocks.length; index += 1) {
          const nextBlock = changedBlocks[index];
          previewBlockIdRef.current += 1;
          const element = document.createElement("section");
          element.className = "preview-block";
          element.dataset.previewBlockId = `preview-block-${previewBlockIdRef.current}`;
          element.innerHTML = changedHtmlBlocks[index];
          nextRenderedBlocks.push({
            id: element.dataset.previewBlockId ?? `preview-block-${previewBlockIdRef.current}`,
            hash: nextBlock.hash,
            startLine: nextBlock.startLine,
            endLine: nextBlock.endLine,
            element
          });
        }

        const nextSuffixStart = prefixLength + changedBlocks.length;
        const currentSuffixStart = currentTailIndex + 1;
        for (let nextIndex = nextSuffixStart; nextIndex < nextBlocks.length; nextIndex += 1) {
          const previousBlock = currentBlocks[currentSuffixStart + (nextIndex - nextSuffixStart)];
          const nextBlock = nextBlocks[nextIndex];

          if (!previousBlock) {
            continue;
          }

          nextRenderedBlocks.push({
            ...previousBlock,
            hash: nextBlock.hash,
            startLine: nextBlock.startLine,
            endLine: nextBlock.endLine
          });
        }

        const fragment = document.createDocumentFragment();
        for (const block of nextRenderedBlocks) {
          block.element.dataset.startLine = String(block.startLine);
          block.element.dataset.endLine = String(block.endLine);
          fragment.appendChild(block.element);
        }

        previewProseRef.current.replaceChildren(fragment);
        previewBlocksRef.current = nextRenderedBlocks;
        setPageError(parsedSource.frontmatterError);
        schedulePreviewCursorSyncRef.current?.();
      })
      .catch((error: Error) => {
        if (previewRenderRequestRef.current === requestId) {
          setPageError(error.message);
        }
      });
  }, [activeDocument?.id, previewReadyVersion, previewSourceText, previewVisible]);

  useEffect(() => {
    const editor = editorRef.current;
    const previewElement = previewRef.current;

    if (!editor || !previewElement || !previewVisible || !isArticleDocument(activeDocument)) {
      schedulePreviewCursorSyncRef.current = null;
      return;
    }

    const runCursorSync = () => {
      previewCursorSyncRafRef.current = null;

      const position = editor.getPosition();
      if (!position) {
        return;
      }

      const block = findPreviewBlockByLine(previewBlocksRef.current, position.lineNumber);
      if (!block || !block.element.isConnected) {
        return;
      }

      const blockTop = block.element.offsetTop;
      const blockHeight = Math.max(block.element.offsetHeight, 1);
      const blockBottom = blockTop + blockHeight;
      const viewportHeight = previewElement.clientHeight;
      const currentScrollTop = previewElement.scrollTop;
      const focusBandTop = currentScrollTop + viewportHeight * 0.25;
      const focusBandBottom = currentScrollTop + viewportHeight * 0.75;

      if (blockBottom >= focusBandTop && blockTop <= focusBandBottom) {
        return;
      }

      const desiredTop = blockTop - viewportHeight * 0.5 + blockHeight * 0.5;
      const maxScrollTop = Math.max(previewElement.scrollHeight - viewportHeight, 0);
      previewElement.scrollTo({
        top: Math.min(maxScrollTop, Math.max(0, desiredTop)),
        behavior: "smooth"
      });
    };

    const scheduleCursorSync = () => {
      if (previewCursorSyncRafRef.current !== null) {
        return;
      }

      previewCursorSyncRafRef.current = window.requestAnimationFrame(runCursorSync);
    };

    schedulePreviewCursorSyncRef.current = scheduleCursorSync;

    const cursorDisposable = editor.onDidChangeCursorPosition(() => {
      scheduleCursorSync();
    });
    const scrollDisposable = editor.onDidScrollChange((event) => {
      if (event.scrollTopChanged) {
        scheduleCursorSync();
      }
    });

    scheduleCursorSync();

    return () => {
      schedulePreviewCursorSyncRef.current = null;
      cursorDisposable.dispose();
      scrollDisposable.dispose();

      if (previewCursorSyncRafRef.current !== null) {
        window.cancelAnimationFrame(previewCursorSyncRafRef.current);
        previewCursorSyncRafRef.current = null;
      }
    };
  }, [activeDocument?.id, editorReadyVersion, previewReadyVersion, previewVisible]);

  useEffect(() => {
    return () => {
      if (previewUpdateTimerRef.current !== null) {
        window.clearTimeout(previewUpdateTimerRef.current);
        previewUpdateTimerRef.current = null;
      }

      if (previewCursorSyncRafRef.current !== null) {
        window.cancelAnimationFrame(previewCursorSyncRafRef.current);
        previewCursorSyncRafRef.current = null;
      }

      previewBlocksRef.current = [];
      schedulePreviewCursorSyncRef.current = null;
      previewProseRef.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (commandPaletteOpen) {
        return;
      }

      const editor = editorRef.current;
      const model = editor?.getModel();
      const position = editor?.getPosition();
      const snippetLanguage =
        editor && model && position && isArticleDocument(activeDocument) ? getSnippetLanguage(model, position) : "markdown";
      const context = {
        editorLangId: snippetLanguage,
        editorTextFocus: Boolean(editor?.hasTextFocus()),
        textInputFocus: Boolean(editor?.hasTextFocus()),
        inputFocus: Boolean(editor?.hasTextFocus()),
        suggestWidgetVisible: Boolean(document.querySelector(".suggest-widget.visible"))
      };
      const binding = getActiveKeybinding(normalizedConfig.keybindings, event, context);
      if (!binding || !workbenchApiRef.current || !isWorkbenchKeybindingCommand(binding.command)) {
        return;
      }

      const command = pluginRuntime.getCommand(
        binding.command === "workbench.action.showCommands" ? "workbench.showCommandPalette" : binding.command
      );
      if (!command) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void command.handler(workbenchApiRef.current);
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [activeDocument, commandPaletteOpen, normalizedConfig.keybindings, pluginRuntime]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (sidebarView !== "explorer") {
        return;
      }
      const activeElement = document.activeElement;
      if (!treeRootRef.current?.contains(activeElement) || activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      const targetNode = selectedTreeNode;
      const targetDirectoryPath = !targetNode ? "" : targetNode.type === "directory" ? targetNode.path : getParentPath(targetNode.path);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && targetNode) {
        event.preventDefault();
        setTreeClipboard({ path: targetNode.path, mode: "copy" });
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x" && targetNode) {
        event.preventDefault();
        setTreeClipboard({ path: targetNode.path, mode: "move" });
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && treeClipboard) {
        event.preventDefault();
        setBusyMessage("Applying file operation...");
        api.transferFileSystemEntry(treeClipboard.path, targetDirectoryPath, treeClipboard.mode)
          .then(async (result) => {
            await loadTree();
            if (treeClipboard.mode === "move") {
              setDocuments((current) => remapDocuments(current, treeClipboard.path, result.path));
              draftValuesRef.current = Object.fromEntries(Object.entries(draftValuesRef.current).map(([key, value]) => key.startsWith("article:") ? [`article:${replacePathPrefix(key.slice("article:".length), treeClipboard.path, result.path)}`, value] : [key, value]));
              setTreeClipboard(null);
            }
            setSelectedTreePath(result.path);
            setPageError(null);
          })
          .catch((error: Error) => setPageError(error.message))
          .finally(() => setBusyMessage(null));
      } else if (event.key === "Delete" && targetNode) {
        event.preventDefault();
        setFileDialog({
          entryType: targetNode.type === "directory" ? "directory" : "file",
          fileKind: targetNode.type === "file" ? targetNode.fileKind : undefined,
          mode: "delete",
          path: targetNode.path,
          value: targetNode.name,
          metadata: {}
        });
      }
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [selectedTreeNode, sidebarView, treeClipboard]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReadyVersion((current) => current + 1);
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: getJsonSchemaDefinitions()
    });
    if (activeTheme) {
      monaco.editor.setTheme(activeTheme.id);
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }
    const allSnippets = [...normalizedConfig.markdownSnippets, ...normalizedConfig.latexSnippets];
    const markdownSymbolTriggerCharacters = getSymbolTriggerCharacters(normalizedConfig.markdownSnippets);
    const latexSymbolTriggerCharacters = getSymbolTriggerCharacters(normalizedConfig.latexSnippets);
    const completionProvider = monaco.languages.registerCompletionItemProvider("markdown", {
      provideCompletionItems(model, position) {
        if (!isArticleDocument(activeDocument)) {
          return { suggestions: [] };
        }
        const snippetLanguage = getSnippetLanguage(model, position);
        const relevantSnippets = getScopedSnippets(
          snippetLanguage === "latex" ? normalizedConfig.latexSnippets : normalizedConfig.markdownSnippets,
          snippetLanguage
        );
        const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
        const trailingWord = /[A-Za-z0-9_-]+$/.exec(linePrefix)?.[0] ?? "";
        const symbolSuffix = getSymbolSuffix(linePrefix);
        const suggestions: monacoEditor.languages.CompletionItem[] = [];
        relevantSnippets.forEach((snippet) => {
          snippet.prefix.forEach((prefix) => {
            const isSymbol = isSymbolSnippetPrefix(prefix);
            const replacementText =
              isSymbol
                ? linePrefix.endsWith(prefix)
                  ? prefix
                  : symbolSuffix && prefix.startsWith(symbolSuffix)
                    ? symbolSuffix
                    : ""
                : trailingWord && prefix.toLowerCase().startsWith(trailingWord.toLowerCase())
                  ? trailingWord
                  : !trailingWord && linePrefix.endsWith(prefix)
                    ? prefix
                    : "";
            if (!replacementText) {
              return;
            }
            suggestions.push({
              kind: monaco.languages.CompletionItemKind.Snippet,
              label: { label: snippet.name, description: prefix },
              filterText: `${prefix} ${snippet.name} ${snippet.description ?? ""}`.trim(),
              insertText: toSnippetBody(snippet.body),
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: new monaco.Range(position.lineNumber, Math.max(1, position.column - replacementText.length), position.lineNumber, position.column),
              sortText: `0-${prefix}`
            });
          });
        });
        return { suggestions };
      }
    });
    const domNode = editor.getDomNode();
    const textarea = domNode?.querySelector("textarea.inputarea");
    const getSnippetController = () =>
      editor.getContribution("snippetController2") as {
        insert: (template: string) => void;
        isInSnippet?: () => boolean;
      } | null;
    const insertSnippet = (snippet: EditorSnippet) => {
      getSnippetController()?.insert(toSnippetBody(snippet.body));
    };
    const createEditorWhenContext = () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      const hasSelection = Boolean(editor.getSelection()) && !editor.getSelection()?.isEmpty();
      const editorHasTextFocus = editor.hasTextFocus();
      const snippetController = getSnippetController();
      const snippetLanguage =
        model && position && isArticleDocument(activeDocument) ? getSnippetLanguage(model, position) : "markdown";

      return {
        editorLangId: snippetLanguage,
        editorTextFocus: editorHasTextFocus,
        textInputFocus: editorHasTextFocus,
        inputFocus: editorHasTextFocus,
        editorReadonly: editor.getOption(monaco.editor.EditorOption.readOnly),
        editorHasCompletionItemProvider: isArticleDocument(activeDocument),
        suggestWidgetVisible: Boolean(domNode?.querySelector(".suggest-widget.visible")),
        editorHasMultipleSelections: (editor.getSelections()?.length ?? 0) > 1,
        editorHasSelection: hasSelection,
        editorHoverVisible: Boolean(domNode?.querySelector(".monaco-hover.visible")),
        editorHoverFocused: false,
        editorTabMovesFocus: false,
        inlineChatFocused: false,
        notebookEditorFocused: false,
        notebookOutputFocused: false,
        inInlineEditsPreviewEditor: false,
        inlineEditIsVisible: false,
        inlineSuggestionVisible: false,
        inlineSuggestionHasIndentationLessThanTabSize: false,
        tabShouldAcceptInlineEdit: false,
        inSnippetMode: snippetController?.isInSnippet?.() ?? false,
        editor: {
          hasSelection
        },
        trae: {
          hasInlineSuggestShouldAcceptDirect: false
        }
      };
    };
    const executeEditorKeybinding = async (
      keybinding: EditorConfigPayload["keybindings"][number],
      relevantSnippets: NormalizedSnippet[]
    ) => {
      if (keybinding.command === "editor.insertSnippet") {
        const snippetName = String(keybinding.args?.snippetName ?? "");
        const snippet =
          relevantSnippets.find((item) => item.name === snippetName) ??
          allSnippets.find((item) => item.name === snippetName);

        if (snippet) {
          insertSnippet(snippet);
          return true;
        }

        return false;
      }

      if (keybinding.command === "type") {
        editor.trigger("keyboard", "type", keybinding.args ?? {});
        return true;
      }

      if (isWorkbenchKeybindingCommand(keybinding.command)) {
        const workbenchCommand = pluginRuntime.getCommand(
          keybinding.command === "workbench.action.showCommands"
            ? "workbench.showCommandPalette"
            : keybinding.command
        );
        if (workbenchCommand && workbenchApiRef.current) {
          await workbenchCommand.handler(workbenchApiRef.current);
          return true;
        }
      }

      const action = pluginRuntime.getEditorAction(keybinding.command);
      if (action) {
        return await action.handler({ editor, monaco, activeDocument, snippets: relevantSnippets });
      }

      if (
        keybinding.command === "hideSuggestWidget" ||
        keybinding.command === "acceptSelectedSuggestion" ||
        keybinding.command.startsWith("editor.")
      ) {
        editor.trigger("keyboard", keybinding.command, keybinding.args ?? {});
        return true;
      }

      return false;
    };
    const keydownListener = async (event: KeyboardEvent) => {
      if (!editor.hasTextFocus() || !isArticleDocument(activeDocument)) {
        return;
      }
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        return;
      }

      const snippetLanguage = getSnippetLanguage(model, position);
      const relevantSnippets = getScopedSnippets(
        snippetLanguage === "markdown" ? normalizedConfig.markdownSnippets : normalizedConfig.latexSnippets,
        snippetLanguage
      );
      const whenContext = createEditorWhenContext();
      const matchingKeybindings = getMatchingKeybindings(normalizedConfig.keybindings, event, whenContext);
      const activeKeybinding = getActiveKeybinding(normalizedConfig.keybindings, event, whenContext);

      if (activeKeybinding) {
        const handled = await executeEditorKeybinding(activeKeybinding, relevantSnippets);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const removedCommands = matchingKeybindings
        .filter((keybinding) => keybinding.command.startsWith("-"))
        .map((keybinding) => keybinding.command.slice(1));
      const snippetController = getSnippetController();

      if (
        event.key === "Tab" &&
        (snippetController?.isInSnippet?.() ?? false) &&
        removedCommands.includes("acceptSelectedSuggestion")
      ) {
        event.preventDefault();
        event.stopPropagation();
        editor.trigger(
          "keyboard",
          event.shiftKey ? "jumpToPrevSnippetPlaceholder" : "jumpToNextSnippetPlaceholder",
          {}
        );
        return;
      }

      if (removedCommands.some((command) => isSuppressedDefaultEditorCommand(command, whenContext))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const keyedSnippet = relevantSnippets.find((snippet) => snippet.key && matchesKeybindingEvent(snippet.key, event));
      if (keyedSnippet) {
        event.preventDefault();
        event.stopPropagation();
        insertSnippet(keyedSnippet);
        return;
      }
    };
    const typeDisposable = editor.onDidType((text) => {
      if (!isArticleDocument(activeDocument) || text.length !== 1) {
        return;
      }

      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        return;
      }

      const snippetLanguage = getSnippetLanguage(model, position);
      const triggerCharacters =
        snippetLanguage === "latex" ? latexSymbolTriggerCharacters : markdownSymbolTriggerCharacters;

      if (!triggerCharacters.includes(text)) {
        return;
      }

      queueMicrotask(() => {
        if (!editor.hasTextFocus()) {
          return;
        }

        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
      });
    });
    const pasteListener = async (event: ClipboardEvent) => {
      if (!isArticleDocument(activeDocument)) {
        return;
      }

      if ((event as ClipboardEvent & { __blogSystemPasteHandled?: boolean }).__blogSystemPasteHandled) {
        return;
      }

      const target = event.target;
      const targetIsInsideEditor =
        target instanceof Node ? domNode?.contains(target) ?? false : false;
      const activeElement = document.activeElement;
      const focusIsOnEditorTextarea =
        activeElement instanceof HTMLTextAreaElement &&
        activeElement.classList.contains("inputarea") &&
        (domNode?.contains(activeElement) ?? false);

      if (!targetIsInsideEditor && !focusIsOnEditorTextarea) {
        return;
      }

      (event as ClipboardEvent & { __blogSystemPasteHandled?: boolean }).__blogSystemPasteHandled = true;

      for (const handler of pluginRuntime.getPasteHandlers()) {
        const handled = await handler.handle({
          event,
          editor,
          activeDocument,
          uploadClipboardImages: async (articlePath: string, images: ClipboardImageInput[]) => {
            const response = await api.uploadPastedImages(articlePath, images);
            await loadTree();
            return response.assets;
          }
        });
        if (handled) {
          break;
        }
      }
    };
    domNode?.addEventListener("keydown", keydownListener, true);
    domNode?.addEventListener("paste", pasteListener, true);
    textarea?.addEventListener("paste", pasteListener, true);
    window.addEventListener("paste", pasteListener, true);
    return () => {
      completionProvider.dispose();
      typeDisposable.dispose();
      domNode?.removeEventListener("keydown", keydownListener, true);
      domNode?.removeEventListener("paste", pasteListener, true);
      textarea?.removeEventListener("paste", pasteListener, true);
      window.removeEventListener("paste", pasteListener, true);
    };
  }, [activeDocument, editorReadyVersion, normalizedConfig, pluginRuntime]);

  const renderFileNode = (node: FileSystemNode): JSX.Element | null => {
    if (!filterFileTreeNode(node, deferredSearchQuery, tagFilter, statusFilter)) {
      return null;
    }

    if (node.type === "directory") {
      return (
        <details className="tree-group" key={node.path} open>
          <summary
            className={`tree-directory ${selectedTreePath === node.path ? "is-active" : ""}`}
            onClick={() => setSelectedTreePath(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedTreePath(node.path);
              setContextMenuState({ path: node.path, x: event.clientX, y: event.clientY });
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const sourcePath = event.dataTransfer.getData("text/plain");
              if (sourcePath) {
                setBusyMessage("Moving file...");
                api.transferFileSystemEntry(sourcePath, node.path, "move")
                  .then(async (result) => {
                    await loadTree();
                    setDocuments((current) => remapDocuments(current, sourcePath, result.path));
                    setSelectedTreePath(result.path);
                  })
                  .catch((error: Error) => setPageError(error.message))
                  .finally(() => setBusyMessage(null));
              }
            }}
          >
            {node.name}
          </summary>
          <div className="tree-children">{node.children.map((child) => renderFileNode(child))}</div>
        </details>
      );
    }

    return (
      <button
        className={`tree-file ${selectedTreePath === node.path ? "is-active" : ""}`}
        draggable
        key={node.path}
        onClick={() => {
          setSelectedTreePath(node.path);
          if (node.fileKind === "article") {
            void openArticleDocument(node.path);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedTreePath(node.path);
          setContextMenuState({ path: node.path, x: event.clientX, y: event.clientY });
        }}
        onDragStart={(event) => event.dataTransfer.setData("text/plain", node.path)}
        type="button"
      >
        <span className="tree-file-title">{node.article?.title ?? node.name}</span>
        {node.article ? (
          <span className={`status-badge ${node.article.status}`}>{node.article.status}</span>
        ) : (
          <span className="tag-chip">{node.extension || "file"}</span>
        )}
      </button>
    );
  };

  if (!authenticated) {
    return (
      <LoginView
        busy={loginBusy}
        error={loginError}
        onLogin={async (username, password) => {
          setLoginBusy(true);
          setLoginError(null);
          try {
            await api.login(username, password);
            setAuthenticated(true);
          } catch (error) {
            setLoginError((error as Error).message);
          } finally {
            setLoginBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="workbench-shell">
      <CommandPalette
        open={commandPaletteOpen}
        title={commandPaletteMode === "commands" ? "Command Palette" : "Choose Theme"}
        placeholder={commandPaletteMode === "commands" ? "Type a command" : "Type a theme"}
        query={commandQuery}
        selectedIndex={selectedPaletteIndex}
        items={paletteItems}
        onQueryChange={setCommandQuery}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectIndex={setSelectedPaletteIndex}
        onExecute={(id) => {
          if (commandPaletteMode === "themes") {
            setThemeId(id);
            setCommandPaletteOpen(false);
            return;
          }
          if (id.startsWith("render-style:create:")) {
            setCommandPaletteOpen(false);
            void createRenderStyleDocument(id.slice("render-style:create:".length));
            return;
          }
          const command = pluginRuntime.getCommand(id);
          if (!command || !workbenchApiRef.current) {
            return;
          }
          setCommandPaletteOpen(false);
          void command.handler(workbenchApiRef.current);
        }}
      />

      {fileDialog ? (
        <div className="dialog-backdrop" onClick={() => setFileDialog(null)} role="presentation">
          <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
            <p className="title-overline">File System</p>
            <h2>
              {fileDialog.mode === "create-file"
                ? "New File"
                : fileDialog.mode === "create-directory"
                  ? "New Folder"
                  : fileDialog.mode === "rename"
                    ? "Rename Entry"
                    : "Delete Entry"}
            </h2>
            {fileDialog.mode === "delete" ? (
              <p className="body-muted">Delete "{fileDialog.value}" and its nested content if applicable?</p>
            ) : (
              <>
                <label>
                  <span>{fileDialog.entryType === "file" && fileDialog.fileKind === "article" ? "Title" : "Name"}</span>
                  <input value={fileDialog.value} onChange={(event) => setFileDialog({ ...fileDialog, value: event.target.value })} />
                </label>
                {fileDialog.entryType === "file" && fileDialog.fileKind === "article" ? (
                  <p className="body-muted">File name: {deriveArticleFileName(fileDialog.value)}</p>
                ) : null}
                {activeMetadataDialogFields.map((field) => (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <input
                      type={field.input === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={fileDialog.metadata[field.id] ?? ""}
                      onChange={(event) =>
                        setFileDialog({
                          ...fileDialog,
                          metadata: {
                            ...fileDialog.metadata,
                            [field.id]: event.target.value
                          }
                        })
                      }
                    />
                  </label>
                ))}
              </>
            )}
            <div className="dialog-actions">
              <button className="action-button ghost" onClick={() => setFileDialog(null)} type="button">
                Cancel
              </button>
              <button
                className={`action-button ${fileDialog.mode === "delete" ? "danger" : "primary"}`}
                onClick={() => {
                  setBusyMessage("Applying file system change...");
                  const runner =
                    fileDialog.mode === "create-file" || fileDialog.mode === "create-directory"
                      ? api.createFileSystemEntry(
                          fileDialog.path,
                          fileDialog.mode === "create-file" ? "file" : "directory",
                          fileDialog.entryType === "file" && fileDialog.fileKind === "article"
                            ? deriveArticleFileName(fileDialog.value)
                            : fileDialog.value,
                          fileDialog.entryType === "file" && fileDialog.fileKind === "article"
                            ? {
                                ...fileDialog.metadata,
                                title: fileDialog.value
                              }
                            : fileDialog.metadata
                        ).then(async (result) => {
                          await loadTree();
                          setSelectedTreePath(result.path);
                          if (result.path.toLowerCase().endsWith(".md")) {
                            await openArticleDocument(result.path);
                          }
                        })
                      : fileDialog.mode === "rename"
                        ? api.renameFileSystemEntry(
                            fileDialog.path,
                            fileDialog.entryType === "file" && fileDialog.fileKind === "article"
                              ? deriveArticleFileName(fileDialog.value)
                              : fileDialog.value
                          ).then(async (result) => {
                            await api.saveFileSystemMetadata(result.path, {
                              ...fileDialog.metadata,
                              ...(fileDialog.entryType === "file" && fileDialog.fileKind === "article"
                                ? { title: fileDialog.value }
                                : {})
                            });
                            await loadTree();
                            setDocuments((current) => remapDocuments(current, fileDialog.path, result.path));
                            setSelectedTreePath(result.path);
                            if (fileDialog.entryType === "file" && fileDialog.fileKind === "article") {
                              const updatedArticle = await api.getArticle(result.path);
                              const updatedDocument = buildArticleDocument(updatedArticle);
                              draftValuesRef.current[updatedDocument.id] = updatedDocument.value;
                              setDocuments((current) => upsertDocument(remapDocuments(current, fileDialog.path, result.path), updatedDocument));
                              setActiveDocumentId(updatedDocument.id);
                              syncEditorValuePreservingView(updatedDocument.value);
                              schedulePreviewSourceUpdate(updatedDocument.value, { immediate: true });
                            }
                          })
                        : api.deleteFileSystemEntry(fileDialog.path).then(async () => {
                            await loadTree();
                            setDocuments((current) => removeDocuments(current, fileDialog.path));
                            setSelectedTreePath(null);
                          });
                  runner
                    .then(() => {
                      setPageError(null);
                      setFileDialog(null);
                    })
                    .catch((error: Error) => setPageError(error.message))
                    .finally(() => setBusyMessage(null));
                }}
                type="button"
              >
                {fileDialog.mode === "delete" ? "Delete" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewRenderDialogOpen ? (
        <div className="dialog-backdrop" onClick={() => setPreviewRenderDialogOpen(false)} role="presentation">
          <div className="dialog-card preview-render-dialog" onClick={(event) => event.stopPropagation()}>
            <div>
              <p className="title-overline">Preview Render</p>
              <h2>Render CSS</h2>
              <p className="body-muted">
                Toggle the saved `enable` values from `render.json`, or open a stylesheet under `config/render`.
              </p>
            </div>
            <div className="preview-render-style-list">
              {previewRenderStyles.length === 0 ? (
                <p className="body-muted">No render CSS entries are configured in `render.json` yet.</p>
              ) : (
                previewRenderStyles.map((style) => (
                  <div className="preview-render-style-item" key={style.directory}>
                    <input
                      checked={style.enable}
                      onChange={(event) => {
                        void toggleRenderStyleEnable(style.directory, event.target.checked);
                      }}
                      type="checkbox"
                    />
                    <div>
                      <strong>{getRenderStyleTitle(style.directory)}</strong>
                      <span>{getRenderStyleDocumentPath(style.directory)}</span>
                    </div>
                    <button
                      className="action-button ghost"
                      onClick={() => {
                        setPreviewRenderDialogOpen(false);
                        void openRenderStyleDocument(style.directory);
                      }}
                      type="button"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="dialog-actions">
              <button
                className="action-button ghost"
                onClick={() => {
                  setPreviewRenderDialogOpen(false);
                  void openConfigDocument("renderConfig");
                }}
                type="button"
              >
                Open render.json
              </button>
              <button className="action-button primary" onClick={() => setPreviewRenderDialogOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenuState ? (
        <div className="context-menu-backdrop" onClick={() => setContextMenuState(null)} role="presentation">
          <div className="context-menu" style={{ left: contextMenuState.x, top: contextMenuState.y }} onClick={(event) => event.stopPropagation()}>
            {[
              ["new-file", "New File"],
              ["new-directory", "New Folder"],
              ["rename", "Rename"],
              ["copy", "Copy"],
              ["cut", "Cut"],
              ["paste", "Paste"],
              ["delete", "Delete"]
            ].map(([action, label]) => (
              <button
                className={`context-menu-item ${action === "delete" ? "danger" : ""}`}
                disabled={(action === "paste" && !treeClipboard) || ((action === "rename" || action === "copy" || action === "cut" || action === "delete") && !contextTargetNode)}
                key={action}
                onClick={() => {
                  const targetNode = contextTargetNode;
                  const targetDirectory =
                    !targetNode
                      ? ""
                      : targetNode.type === "directory"
                        ? targetNode.path
                        : getParentPath(targetNode.path);
                  setContextMenuState(null);
                  if (action === "copy" && targetNode) {
                    setTreeClipboard({ path: targetNode.path, mode: "copy" });
                    return;
                  }
                  if (action === "cut" && targetNode) {
                    setTreeClipboard({ path: targetNode.path, mode: "move" });
                    return;
                  }
                  if (action === "paste" && treeClipboard) {
                    setBusyMessage("Applying file operation...");
                    api.transferFileSystemEntry(treeClipboard.path, targetDirectory, treeClipboard.mode)
                      .then(async (result) => {
                        await loadTree();
                        if (treeClipboard.mode === "move") {
                          setDocuments((current) => remapDocuments(current, treeClipboard.path, result.path));
                          setTreeClipboard(null);
                        }
                        setSelectedTreePath(result.path);
                      })
                      .catch((error: Error) => setPageError(error.message))
                      .finally(() => setBusyMessage(null));
                    return;
                  }
                  if (action === "new-file" || action === "new-directory") {
                    setFileDialog({
                      entryType: action === "new-file" ? "file" : "directory",
                      fileKind: action === "new-file" ? "article" : undefined,
                      mode: action === "new-file" ? "create-file" : "create-directory",
                      path: targetDirectory,
                      value: action === "new-file" ? "New File" : "new-folder",
                      metadata: getCreateDialogMetadataDefaults(action === "new-file" ? "file" : "directory")
                    });
                  } else if (action === "rename" && targetNode) {
                    void openRenameDialog(targetNode);
                  } else if (action === "delete" && targetNode) {
                    setFileDialog({
                      entryType: targetNode.type === "directory" ? "directory" : "file",
                      fileKind: targetNode.type === "file" ? targetNode.fileKind : undefined,
                      mode: "delete",
                      path: targetNode.path,
                      value: targetNode.name,
                      metadata: {}
                    });
                  }
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="activity-bar">
        <div className="activity-brand">KB</div>
        <button
          aria-label="Explorer"
          className={`activity-button ${sidebarVisible && sidebarView === "explorer" ? "is-active" : ""}`}
          onClick={() => {
            setSidebarView("explorer");
            setSidebarVisible((current) => sidebarView === "explorer" ? !current : true);
          }}
          title="Explorer"
          type="button"
        >
          <ActivityIcon icon="explorer" />
        </button>
        <button
          aria-label="Edit"
          className={`activity-button ${sidebarVisible && sidebarView === "edit" ? "is-active" : ""}`}
          onClick={() => {
            setSidebarView("edit");
            setSidebarVisible((current) => sidebarView === "edit" ? !current : true);
          }}
          title="Edit"
          type="button"
        >
          <ActivityIcon icon="edit" />
        </button>
        <button
          aria-label="Plugins"
          className={`activity-button ${sidebarVisible && sidebarView === "plugins" ? "is-active" : ""}`}
          onClick={() => {
            setSidebarView("plugins");
            setSidebarVisible((current) => sidebarView === "plugins" ? !current : true);
          }}
          title="Plugins"
          type="button"
        >
          <ActivityIcon icon="plugins" />
        </button>
        {sidebarViewContributions.map((view) => (
          <button
            aria-label={view.title}
            className={`activity-button ${sidebarVisible && sidebarView === view.viewId ? "is-active" : ""}`}
            key={view.id}
            onClick={() => {
              setSidebarView(view.viewId);
              setSidebarVisible((current) => (sidebarView === view.viewId ? !current : true));
            }}
            title={view.title}
            type="button"
          >
            <ActivityIcon icon={getSidebarViewIcon(view.viewId)} />
          </button>
        ))}
        <button aria-label="Command Palette" className="activity-button bottom" onClick={() => openPalette("commands")} title="Command Palette" type="button">
          <ActivityIcon icon="command" />
        </button>
      </div>

      <div
        className="main-shell"
        style={{
          gridTemplateColumns: sidebarVisible ? `${sidebarWidth}px 8px 1fr` : "0 0 1fr"
        }}
      >
        <aside className={`sidebar-panel ${sidebarVisible ? "" : "is-collapsed"}`} style={sidebarVisible ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : undefined}>
          {sidebarVisible ? (
            sidebarView === "explorer" ? (
              <div className="sidebar-scroll" ref={treeRootRef}>
                {treeClipboard ? (
                  <div className="sidebar-section">
                    <span className="status-pill info">{treeClipboard.mode === "copy" ? "Copy" : "Cut"}: {getBaseName(treeClipboard.path)}</span>
                  </div>
                ) : null}
                <div className="sidebar-section filters-section">
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Filter files" />
                  <div className="filter-inline-row">
                    <label className="filter-inline">
                      <span>Tag</span>
                      <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                        <option value="all">All</option>
                        {selectedTags.map((tag) => <option key={tag.tag} value={tag.tag}>{tag.tag} ({tag.count})</option>)}
                      </select>
                    </label>
                    <label className="filter-inline">
                      <span>Status</span>
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "draft" | "published")}>
                        <option value="all">All</option>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="sidebar-section tree-section" onContextMenu={(event) => { event.preventDefault(); setContextMenuState({ path: "", x: event.clientX, y: event.clientY }); }}>
                  {(treePayload?.fileTree ?? []).map((node) => renderFileNode(node))}
                </div>
              </div>
            ) : sidebarView === "edit" ? (
              <div className="sidebar-scroll">
                <div className="sidebar-section">
                  <strong>Edit Actions</strong>
                  <div className="edit-actions">
                    <button className="action-button accent" onClick={() => void publishStaticSite()} type="button">
                      Publish Static Site
                    </button>
                    {isArticleDocument(activeDocument) ? (
                      <button
                        className="action-button ghost"
                        onClick={async () => {
                          setBusyMessage("Updating status...");
                          try {
                            const updated = await api.updateStatus(
                              activeDocument.articlePath,
                              activeDocument.record.status === "draft" ? "published" : "draft"
                            );
                            const updatedDocument = buildArticleDocument(updated);
                            setDocuments((current) => upsertDocument(current, updatedDocument));
                            setActiveDocumentId(updatedDocument.id);
                            draftValuesRef.current[updatedDocument.id] = updatedDocument.value;
                            syncEditorValuePreservingView(updatedDocument.value);
                            schedulePreviewSourceUpdate(updatedDocument.value, { immediate: true });
                            await loadTree();
                            setPageError(null);
                          } catch (error) {
                            setPageError((error as Error).message);
                          } finally {
                            setBusyMessage(null);
                          }
                        }}
                        type="button"
                      >
                        {activeDocument.record.status === "draft" ? "Publish Article" : "Move To Draft"}
                      </button>
                    ) : null}
                    <button className="action-button primary" disabled={!activeDocument} onClick={() => void saveActiveDocument()} type="button">
                      Save
                    </button>
                  </div>
                  {busyMessage ? <span className="status-pill info">{busyMessage}</span> : null}
                  {pageError ? <span className="status-pill error">{pageError}</span> : null}
                  {configPayload?.warnings.length ? <span className="status-pill warning">{configPayload.warnings.length} config warning{configPayload.warnings.length > 1 ? "s" : ""}</span> : null}
                </div>
                <div className="sidebar-section">
                  <div className="sidebar-section-header">
                    <strong>Render CSS</strong>
                    <button
                      className="action-button ghost"
                      onClick={() => {
                        setSidebarVisible(true);
                        openPalette("commands");
                      }}
                      type="button"
                    >
                      Create Render CSS
                    </button>
                  </div>
                  <p className="body-muted">Open the command palette, type a CSS file name, and create `config/render/*.css` directly.</p>
                </div>
                <div className="sidebar-section search-results">
                  {previewRenderStyles.length === 0 ? (
                    <div className="empty-state">No render CSS entries.</div>
                  ) : (
                    previewRenderStyles.map((style) => (
                      <div className="render-style-row" key={style.directory}>
                        <label className="render-style-toggle">
                          <input
                            checked={style.enable}
                            onChange={(event) => {
                              void toggleRenderStyleEnable(style.directory, event.target.checked);
                            }}
                            type="checkbox"
                          />
                          <div className="search-result">
                            <strong>{getRenderStyleTitle(style.directory)}</strong>
                            <span>{getRenderStyleDocumentPath(style.directory)}</span>
                          </div>
                        </label>
                        <button className="action-button ghost" onClick={() => void openRenderStyleDocument(style.directory)} type="button">
                          Open
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : sidebarView === "media" ? (
              <div className="sidebar-scroll">
                <div className="sidebar-section">
                  <label>
                    <span>Upload Images</span>
                    <input
                      accept="image/*"
                      onChange={(event) => void uploadMediaFiles(event.target.files)}
                      type="file"
                      multiple
                    />
                  </label>
                </div>
                <div className="sidebar-section media-list">
                  {mediaAssets.length === 0 ? (
                    <div className="empty-state">No media assets.</div>
                  ) : (
                    mediaAssets.map((asset) => (
                      <button
                        className="search-result"
                        key={asset.relativePath}
                        onClick={async () => {
                          await navigator.clipboard.writeText(`@media/${asset.fileName}`);
                        }}
                        type="button"
                      >
                        <img alt={asset.fileName} src={asset.urlPath} />
                        <strong>{asset.fileName}</strong>
                        <span>{asset.mimeType} · {formatBytes(asset.size)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : sidebarView === "git" ? (
              <div className="sidebar-scroll">
                <div className="sidebar-section">
                  <label>
                    <span>Commit Message</span>
                    <input value={gitCommitMessage} onChange={(event) => setGitCommitMessage(event.target.value)} />
                  </label>
                  {!gitInitialized ? (
                    <button
                      className="action-button ghost"
                      onClick={async () => {
                        setBusyMessage("Initializing git repository...");
                        try {
                          await api.initGitRepository();
                          await loadGitData();
                          setPageError(null);
                        } catch (error) {
                          setPageError((error as Error).message);
                        } finally {
                          setBusyMessage(null);
                        }
                      }}
                      type="button"
                    >
                      Init Repository
                    </button>
                  ) : null}
                  <button
                    className="action-button primary"
                    disabled={!gitInitialized}
                    onClick={async () => {
                      setBusyMessage("Creating commit...");
                      try {
                        await api.createGitCommit(gitCommitMessage);
                        await loadGitData();
                        setPageError(null);
                      } catch (error) {
                        setPageError((error as Error).message);
                      } finally {
                        setBusyMessage(null);
                      }
                    }}
                    type="button"
                  >
                    Commit
                  </button>
                </div>
                <div className="sidebar-section search-results">
                  <strong>Changed Files</strong>
                  {gitChangedFiles.length === 0 ? (
                    <div className="empty-state">No pending changes.</div>
                  ) : (
                    gitChangedFiles.map((file) => (
                      <div className="search-result" key={`${file.status}:${file.path}`}>
                        <strong>{file.status}</strong>
                        <span>{file.path}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="sidebar-section search-results">
                  <strong>History</strong>
                  {gitCommits.length === 0 ? (
                    <div className="empty-state">No commits.</div>
                  ) : (
                    gitCommits.map((commit) => (
                      <div className="search-result" key={commit.hash}>
                        <strong>{commit.message}</strong>
                        <span>{commit.hash.slice(0, 7)} · {commit.timestamp}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="sidebar-scroll">
                <div className="sidebar-section plugin-list">
                  {builtInPlugins.map((plugin) => {
                    const enabled = !disabledPluginIds.includes(plugin.id);
                    return (
                      <div className="plugin-card" key={plugin.id}>
                        <div className="plugin-card-header">
                          <div>
                            <strong>{plugin.label}</strong>
                            <p>{plugin.description}</p>
                          </div>
                          <button className={`action-button ${enabled ? "ghost" : "primary"}`} onClick={() => setDisabledPluginIds((current) => enabled ? [...current, plugin.id] : current.filter((id) => id !== plugin.id))} type="button">
                            {enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                        <div className="plugin-card-meta">
                          <span className={`status-pill ${enabled ? "info" : "warning"}`}>{enabled ? "Enabled" : "Disabled"}</span>
                          <span className="body-muted">{plugin.id}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}
        </aside>

        <div
          className={`panel-resizer ${sidebarVisible ? "" : "is-hidden"}`}
          onPointerDown={(event) => startResize("sidebar", event.clientX)}
          role="presentation"
        />

        <section
          className={`workspace-grid ${previewVisible && isArticleDocument(activeDocument) ? "with-preview" : ""}`}
          style={
            previewVisible && isArticleDocument(activeDocument)
              ? { gridTemplateColumns: `minmax(0, 1fr) 8px ${previewWidth}px` }
              : undefined
          }
        >
          <div className="editor-group">
            <div className="tab-bar">
              {documents.map((document) => (
                <button className={`tab-button ${document.id === activeDocumentId ? "is-active" : ""}`} key={document.id} onClick={() => setActiveDocumentId(document.id)} type="button">
                  <span>{document.title}</span>
                  {document.dirty ? <span className="dirty-dot">*</span> : null}
                  <span className="tab-close" onClick={(event) => { event.stopPropagation(); const nextDocuments = closeDocument(documents, document.id); setDocuments(nextDocuments); if (activeDocumentId === document.id) { setActiveDocumentId(nextDocuments[nextDocuments.length - 1]?.id ?? null); } }} role="presentation">
                    x
                  </span>
                </button>
              ))}
            </div>
            <div className="editor-surface">
              {activeDocument ? (
                <Editor
                  key={activeDocument.id}
                  beforeMount={(monaco) => {
                    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                      validate: true,
                      schemas: getJsonSchemaDefinitions()
                    });
                  }}
                  defaultLanguage={activeDocument.language}
                  defaultValue={getDraftValue(activeDocument)}
                  language={activeDocument.language}
                  onMount={handleEditorMount}
                  options={{ automaticLayout: true, fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontLigatures: true, minimap: { enabled: false }, smoothScrolling: true, tabCompletion: "on", quickSuggestions: { other: true, strings: true, comments: false }, snippetSuggestions: "top", wordWrap: "on" }}
                  path={
                    activeDocument.kind === "article"
                      ? activeDocument.articlePath
                      : activeDocument.kind === "renderStyle"
                        ? activeDocument.editorPath
                        : getConfigDocumentPath(activeDocument.configKind)
                  }
                  onChange={(value) => {
                    const nextValue = value ?? "";
                    draftValuesRef.current[activeDocument.id] = nextValue;
                    setDocuments((current) => {
                      let changed = false;
                      const nextDocuments = current.map((document) => {
                        if (document.id !== activeDocument.id) {
                          return document;
                        }

                        const shouldBeDirty = nextValue !== document.savedValue;
                        if (document.dirty !== shouldBeDirty || document.value !== nextValue) {
                          changed = true;
                          return { ...document, value: nextValue, dirty: shouldBeDirty };
                        }

                        return document;
                      });

                      return changed ? nextDocuments : current;
                    });
                    if (activeDocument.kind === "article" && previewVisible) {
                      schedulePreviewSourceUpdate(nextValue);
                    }
                  }}
                />
              ) : (
                <div className="empty-editor">Open an article or JSON config document.</div>
              )}
            </div>
          </div>

          {previewVisible && isArticleDocument(activeDocument) ? (
            <>
            <div
              className="panel-resizer vertical"
              onPointerDown={(event) => startResize("preview", event.clientX)}
              role="presentation"
            />
            <aside className="preview-group">
              <button className="action-button ghost preview-float-button" onClick={() => setPreviewRenderDialogOpen(true)} type="button">
                Render CSS
              </button>
              <div className="preview-scroll" ref={attachPreviewRef}>
                <div className="preview-shadow-host" ref={attachPreviewSurfaceRef} />
              </div>
            </aside>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
