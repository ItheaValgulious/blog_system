import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ArticleRecord,
  ArticleSummary,
  ContentTreeNode,
  FileSystemNode,
  SiteData,
  SiteDirectoryPage,
  TagInfo
} from "./types.js";
import {
  normalizeArticleForSave,
  normalizeTags,
  parseArticleSource,
  serializeArticle,
  toArticleSummary,
  toPosixPath
} from "./utils.js";

const DIRECTORY_METADATA_FILE_NAME = ".blog-system-folder.json";

async function walkDirectory(rootDir: string, currentDir = ""): Promise<string[]> {
  const absoluteDir = path.join(rootDir, currentDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const relativePath = currentDir ? path.join(currentDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(rootDir, relativePath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(toPosixPath(relativePath));
    }
  }

  return files;
}

async function loadDirectoryMetadataTags(contentRoot: string, relativeDirectoryPath: string) {
  const normalizedDirectoryPath = toPosixPath(relativeDirectoryPath).replace(/\/+$/g, "");
  const segments = normalizedDirectoryPath ? normalizedDirectoryPath.split("/") : [];
  const mergedTags: string[] = [];

  for (let index = 0; index <= segments.length; index += 1) {
    const candidateDirectory = segments.slice(0, index).join("/");
    const metadataPath = resolveContentPath(
      contentRoot,
      candidateDirectory
        ? path.posix.join(candidateDirectory, DIRECTORY_METADATA_FILE_NAME)
        : DIRECTORY_METADATA_FILE_NAME
    );

    try {
      const rawMetadata = await fs.readFile(metadataPath, "utf8");
      const parsed = JSON.parse(rawMetadata) as { tags?: unknown };

      for (const tag of normalizeTags(parsed.tags)) {
        if (!mergedTags.includes(tag)) {
          mergedTags.push(tag);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return mergedTags;
}

async function walkFileSystemTree(
  rootDir: string,
  articleMap: Map<string, ArticleRecord>,
  basePath = "",
  currentDir = ""
): Promise<FileSystemNode[]> {
  const absoluteDir = path.join(rootDir, currentDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const nodes: FileSystemNode[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const relativePath = toPosixPath(currentDir ? path.join(currentDir, entry.name) : entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: await walkFileSystemTree(rootDir, articleMap, basePath, relativePath)
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const article = articleMap.get(relativePath);
    nodes.push({
      type: "file",
      name: entry.name,
      path: relativePath,
      extension: path.posix.extname(relativePath).toLowerCase(),
      fileKind: article ? "article" : "asset",
      article: article ? toArticleSummary(article, basePath) : undefined
    });
  }

  return nodes;
}

export function sortArticles(records: ArticleRecord[]): ArticleRecord[] {
  return [...records].sort((left, right) => {
    if (left.top !== right.top) {
      return right.top - left.top;
    }

    const leftDate = left.date ? Date.parse(left.date) : 0;
    const rightDate = right.date ? Date.parse(right.date) : 0;

    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    return left.path.localeCompare(right.path);
  });
}

export async function readArticle(contentRoot: string, relativePath: string): Promise<ArticleRecord> {
  const absolutePath = resolveContentPath(contentRoot, relativePath);
  const rawContent = await fs.readFile(absolutePath, "utf8");
  const parsed = parseArticleSource(relativePath, rawContent);
  const inheritedTags = await loadDirectoryMetadataTags(contentRoot, parsed.directory);
  const mergedTags = [...inheritedTags, ...parsed.tags].filter(
    (tag, index, tags) => tags.indexOf(tag) === index
  );

  if (mergedTags.length === parsed.tags.length && mergedTags.every((tag, index) => tag === parsed.tags[index])) {
    return parsed;
  }

  const frontmatter = {
    ...parsed.frontmatter,
    tags: mergedTags
  };

  return {
    ...parsed,
    frontmatter,
    tags: mergedTags,
    rawContent: serializeArticle({
      frontmatter,
      body: parsed.body
    })
  };
}

export async function scanArticles(contentRoot: string): Promise<ArticleRecord[]> {
  const markdownPaths = await walkDirectory(contentRoot);
  const records = await Promise.all(markdownPaths.map((relativePath) => readArticle(contentRoot, relativePath)));
  return sortArticles(records);
}

export async function buildFileSystemTree(
  contentRoot: string,
  articles?: ArticleRecord[],
  basePath = ""
): Promise<FileSystemNode[]> {
  const resolvedArticles = articles ?? (await scanArticles(contentRoot));
  const articleMap = new Map(resolvedArticles.map((article) => [article.path, article]));
  return walkFileSystemTree(contentRoot, articleMap, basePath);
}

export function buildContentTree(articles: ArticleRecord[], basePath = ""): ContentTreeNode[] {
  const root: ContentTreeNode[] = [];

  for (const article of articles) {
    const segments = article.directory ? article.directory.split("/") : [];
    let cursor = root;
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let nextNode = cursor.find(
        (node) => node.type === "directory" && node.path === currentPath
      );

      if (!nextNode) {
        nextNode = {
          type: "directory",
          name: segment,
          path: currentPath,
          children: []
        };
        cursor.push(nextNode);
      }

      cursor = nextNode.children ?? [];
      nextNode.children = cursor;
    }

    cursor.push({
      type: "article",
      name: article.title,
      path: article.path,
      article: toArticleSummary(article, basePath)
    });
  }

  return root;
}

export function collectTags(articles: ArticleRecord[]): TagInfo[] {
  const tagMap = new Map<string, TagInfo>();

  for (const article of articles) {
    for (const tag of article.tags) {
      const existing = tagMap.get(tag) ?? {
        tag,
        count: 0,
        draftCount: 0,
        publishedCount: 0
      };
      existing.count += 1;
      if (article.status === "published") {
        existing.publishedCount += 1;
      } else {
        existing.draftCount += 1;
      }
      tagMap.set(tag, existing);
    }
  }

  return [...tagMap.values()].sort((left, right) => left.tag.localeCompare(right.tag));
}

function buildDirectoryPages(
  treeNodes: ContentTreeNode[],
  basePath = "",
  currentPath = ""
): SiteDirectoryPage[] {
  const normalizedBase = basePath ? `/${basePath.replace(/^\/+|\/+$/g, "")}` : "";

  return treeNodes
    .filter((node): node is ContentTreeNode & { type: "directory"; children: ContentTreeNode[] } => node.type === "directory")
    .map((node) => {
      const articles = (node.children ?? [])
        .filter((child): child is ContentTreeNode & { type: "article"; article: ArticleSummary } => child.type === "article" && Boolean(child.article))
        .map((child) => child.article as ArticleSummary);
      const nextPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      return {
        path: nextPath,
        name: node.name,
        articles,
        children: buildDirectoryPages(node.children ?? [], basePath, nextPath),
        urlPath: `${normalizedBase}/tree/${nextPath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/")}/`.replace(/\/{2,}/g, "/")
      };
    });
}

export async function loadSiteData(contentRoot: string, basePath = ""): Promise<SiteData> {
  const allArticles = await scanArticles(contentRoot);
  const publishedArticles = allArticles.filter((article) => article.status === "published");
  const tree = buildContentTree(publishedArticles, basePath);

  return {
    articles: publishedArticles.map((article) => toArticleSummary(article, basePath)),
    tags: collectTags(publishedArticles),
    tree,
    directories: buildDirectoryPages(tree, basePath)
  };
}

export async function saveArticle(
  contentRoot: string,
  relativePath: string,
  rawContent: string
): Promise<ArticleRecord> {
  const normalized = normalizeArticleForSave(relativePath, rawContent);
  const absolutePath = resolveContentPath(contentRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, normalized.rawContent, "utf8");
  return normalized;
}

export async function createArticle(
  contentRoot: string,
  relativeDirectory: string,
  fileName: string,
  templateContent: string
): Promise<ArticleRecord> {
  const safeFileName = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const relativePath = toPosixPath(path.posix.join(relativeDirectory, safeFileName));
  const absolutePath = resolveContentPath(contentRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, templateContent, "utf8");
  return readArticle(contentRoot, relativePath);
}

export function resolveContentPath(contentRoot: string, relativePath: string): string {
  const absoluteRoot = path.resolve(contentRoot);
  const resolved = path.resolve(absoluteRoot, relativePath);

  if (!resolved.startsWith(absoluteRoot)) {
    throw new Error("Path escapes the content root.");
  }

  return resolved;
}
