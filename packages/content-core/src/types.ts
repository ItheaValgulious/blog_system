export type ArticleStatus = "draft" | "working" | "published";

export interface ArticleFrontmatter {
  title?: string;
  tags?: string[];
  status?: ArticleStatus;
  top?: number;
  date?: string;
  summary?: string;
  slug?: string;
  password?: string;
  [key: string]: unknown;
}

export interface HeadingItem {
  depth: number;
  text: string;
  id: string;
  lineNumber?: number;
}

export interface ArticleRecord {
  path: string;
  directory: string;
  fileName: string;
  rawContent: string;
  body: string;
  frontmatter: ArticleFrontmatter;
  title: string;
  slug: string;
  status: ArticleStatus;
  top: number;
  date?: string;
  summary?: string;
  tags: string[];
  excerpt: string;
  isProtected: boolean;
}

export interface ArticleRenderResult {
  errors?: MarkdownRenderError[];
  html: string;
  headings: HeadingItem[];
}

export interface MarkdownFenceRenderContext {
  content: string;
  language: string;
  meta?: string;
  position?: {
    endLine?: number;
    startLine?: number;
  };
}

export interface MarkdownFenceRenderOutput {
  cssText?: string;
  html: string;
}

export interface MarkdownFenceRendererDefinition {
  language: string;
  name: string;
  render: (context: MarkdownFenceRenderContext) => MarkdownFenceRenderOutput;
}

export interface MarkdownRenderError {
  code: string;
  endLine?: number;
  fenceLanguage?: string;
  message: string;
  rendererName?: string;
  startLine?: number;
}

export interface MarkdownBlock {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  source: string;
}

export interface ArticleSummary {
  path: string;
  directory: string;
  fileName: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  top: number;
  date?: string;
  summary?: string;
  tags: string[];
  excerpt: string;
  urlPath: string;
  isProtected: boolean;
}

export interface ContentTreeNode {
  type: "directory" | "article";
  name: string;
  path: string;
  children?: ContentTreeNode[];
  article?: ArticleSummary;
}

export interface FileSystemDirectoryNode {
  type: "directory";
  name: string;
  path: string;
  children: FileSystemNode[];
  hasMetadata?: boolean;
}

export interface FileSystemFileNode {
  type: "file";
  name: string;
  path: string;
  extension: string;
  fileKind: "article" | "asset";
  article?: ArticleSummary;
}

export type FileSystemNode = FileSystemDirectoryNode | FileSystemFileNode;

export interface TagInfo {
  tag: string;
  count: number;
  draftCount: number;
  publishedCount: number;
}

export interface EditorSnippet {
  name: string;
  scope?: string;
  prefix?: string | string[];
  key?: string;
  body: string | string[];
  description?: string;
}

export interface EditorKeybinding {
  key: string;
  command: string;
  when?: string;
  args?: Record<string, unknown>;
}

export interface EditorConfig {
  snippets: EditorSnippet[];
  keybindings: EditorKeybinding[];
}

export interface EditorConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SiteDirectoryPage {
  path: string;
  name: string;
  articles: ArticleSummary[];
  children: SiteDirectoryPage[];
  urlPath: string;
}

export interface SiteData {
  articles: ArticleSummary[];
  tags: TagInfo[];
  tree: ContentTreeNode[];
  directories: SiteDirectoryPage[];
}

export interface UsageStatsDocumentEntry {
  documentId: string;
  documentKind: string;
  title: string;
  netCharacterDelta: number;
  updatedAt: string;
}

export interface UsageStatsPeriodEntry {
  activeMilliseconds: number;
  documents: UsageStatsDocumentEntry[];
  periodKey: string;
  totalNetCharacterDelta: number;
  updatedAt: string;
}

export interface UsageStats {
  daily: UsageStatsPeriodEntry[];
  documents: UsageStatsDocumentEntry[];
  totalActiveMilliseconds: number;
  totalNetCharacterDelta: number;
  updatedAt: string;
}
