export type ArticleStatus = "draft" | "published";

export interface ArticleFrontmatter {
  title?: string;
  tags?: string[];
  status?: ArticleStatus;
  top?: number;
  date?: string;
  summary?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface HeadingItem {
  depth: number;
  text: string;
  id: string;
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
}

export interface ArticleRenderResult {
  html: string;
  headings: HeadingItem[];
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
