import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildContentTree,
  buildFileSystemTree,
  collectTags,
  createArticle,
  readArticle,
  resolveContentPath,
  scanArticles
} from "@blog-system/content-core/node";
import {
  normalizeArticleForSave,
  normalizeTags,
  normalizeTop,
  serializeArticle,
  titleFromFileName,
  toPosixPath,
  toArticleSummary,
  type ArticleRecord
} from "@blog-system/content-core";

const DIRECTORY_METADATA_FILE_NAME = ".blog-system-folder.json";

interface FileSystemMetadataPayload {
  tags?: string[];
  title?: string;
  top?: number;
}

export interface DuplicateArticleTitleConflict {
  path: string;
  title: string;
}

export class DuplicateArticleTitleError extends Error {
  readonly code = "duplicate_article_title";
  readonly conflicts: DuplicateArticleTitleConflict[];

  constructor(title: string, conflicts: DuplicateArticleTitleConflict[]) {
    super(`Article title "${title}" already exists.`);
    this.conflicts = conflicts;
  }
}

function buildArticleTemplate(
  fileName: string,
  options?: {
    title?: string;
    tags?: string[];
    top?: number;
  }
) {
  const guessedTitle =
    options?.title?.trim() ||
    fileName
      .replace(/\.md$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const tags = options?.tags ?? [];
  const top = Number.isFinite(options?.top) ? Math.trunc(options?.top ?? 0) : 0;

  return serializeArticle({
    frontmatter: {
      title: guessedTitle,
      tags,
      status: "draft",
      top
    },
    body: `# ${guessedTitle}\n`
  });
}

export async function getTreePayload(contentRoot: string, basePath = "") {
  const articles = await scanArticles(contentRoot);
  return {
    articles: articles.map((article) => toArticleSummary(article, basePath)),
    tree: buildContentTree(articles, basePath),
    fileTree: await buildFileSystemTree(contentRoot, articles, basePath),
    tags: collectTags(articles)
  };
}

async function applyPublishTransitionDate(
  contentRoot: string,
  nextRecord: ArticleRecord
): Promise<ArticleRecord> {
  try {
    const previous = await readArticle(contentRoot, nextRecord.path);

    if (previous.status === "draft" && nextRecord.status === "published") {
      const nextDate =
        typeof nextRecord.frontmatter.date === "string" && nextRecord.frontmatter.date.trim()
          ? nextRecord.frontmatter.date.trim()
          : new Date().toISOString();
      const frontmatter = {
        ...nextRecord.frontmatter,
        date: nextDate,
        status: "published" as const
      };

      return {
        ...nextRecord,
        frontmatter,
        date: frontmatter.date,
        slug: frontmatter.slug ?? nextRecord.slug,
        rawContent: serializeArticle({
          frontmatter,
          body: nextRecord.body
        })
      };
    }

    return nextRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return nextRecord;
    }
    throw error;
  }
}

export async function saveArticleContent(
  contentRoot: string,
  relativePath: string,
  rawContent: string
): Promise<ArticleRecord> {
  const normalized = normalizeArticleForSave(relativePath, rawContent);
  const updatedRecord = await applyPublishTransitionDate(contentRoot, normalized);
  const absolutePath = resolveContentPath(contentRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, updatedRecord.rawContent, "utf8");
  return readArticle(contentRoot, relativePath);
}

export async function updateArticleStatus(
  contentRoot: string,
  relativePath: string,
  status: "draft" | "published"
): Promise<ArticleRecord> {
  const article = await readArticle(contentRoot, relativePath);
  const nextFrontmatter = {
    ...article.frontmatter,
    status,
    date:
      status === "published" && article.status === "draft" && !article.frontmatter.date
        ? new Date().toISOString()
        : article.frontmatter.date
  };
  const serialized = serializeArticle({
    frontmatter: nextFrontmatter,
    body: article.body
  });
  return saveArticleContent(contentRoot, relativePath, serialized);
}

export async function createArticleFile(
  contentRoot: string,
  relativeDirectory: string,
  fileName: string,
  options?: {
    title?: string;
    tags?: string[];
    top?: number;
  }
) {
  const template = buildArticleTemplate(fileName, options);
  return createArticle(contentRoot, relativeDirectory, fileName, template);
}

function normalizeRelativeEntryPath(relativePath = "") {
  const normalized = toPosixPath(relativePath).replace(/\/+$/g, "");
  return normalized === "." ? "" : normalized;
}

async function loadDirectoryMetadataTags(contentRoot: string, relativeDirectoryPath: string) {
  const normalizedDirectoryPath = normalizeRelativeEntryPath(relativeDirectoryPath);
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

async function writeDirectoryMetadataTags(
  contentRoot: string,
  relativeDirectoryPath: string,
  tags: string[]
) {
  const normalizedDirectoryPath = normalizeRelativeEntryPath(relativeDirectoryPath);
  const metadataPath = resolveContentPath(
    contentRoot,
    normalizedDirectoryPath
      ? path.posix.join(normalizedDirectoryPath, DIRECTORY_METADATA_FILE_NAME)
      : DIRECTORY_METADATA_FILE_NAME
  );
  await fs.writeFile(metadataPath, `${JSON.stringify({ tags }, null, 2)}\n`, "utf8");
}

export async function readFileSystemMetadata(contentRoot: string, relativePath: string) {
  const normalizedPath = normalizeRelativeEntryPath(relativePath);
  const absolutePath = resolveContentPath(contentRoot, normalizedPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isDirectory()) {
    return {
      type: "directory" as const,
      metadata: {
        tags: await loadDirectoryMetadataTags(contentRoot, normalizedPath)
      }
    };
  }

  if (normalizedPath.toLowerCase().endsWith(".md")) {
    const article = await readArticle(contentRoot, normalizedPath);
    return {
      type: "file" as const,
      metadata: {
        title: article.title,
        tags: article.tags,
        top: article.top
      }
    };
  }

  return {
    type: "file" as const,
    metadata: {}
  };
}

export async function saveFileSystemMetadata(
  contentRoot: string,
  relativePath: string,
  metadata: FileSystemMetadataPayload
) {
  const normalizedPath = normalizeRelativeEntryPath(relativePath);
  const absolutePath = resolveContentPath(contentRoot, normalizedPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isDirectory()) {
    const tags = normalizeTags(metadata.tags ?? []);
    await writeDirectoryMetadataTags(contentRoot, normalizedPath, tags);
    return { type: "directory" as const };
  }

  if (!normalizedPath.toLowerCase().endsWith(".md")) {
    return { type: "file" as const };
  }

  const article = await readArticle(contentRoot, normalizedPath);
  const nextFrontmatter = {
    ...article.frontmatter,
    title:
      typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : article.frontmatter.title,
    tags: normalizeTags(metadata.tags ?? article.tags),
    top: normalizeTop(metadata.top ?? article.top)
  };

  const serialized = serializeArticle({
    frontmatter: nextFrontmatter,
    body: article.body
  });

  await fs.writeFile(absolutePath, serialized, "utf8");
  return { type: "file" as const };
}

function joinRelativePath(parentPath: string, name: string) {
  const normalizedName = name.trim().replace(/^\/+/, "");

  if (!normalizedName) {
    throw new Error("Name is required.");
  }

  return normalizeRelativeEntryPath(path.posix.join(parentPath, normalizedName));
}

async function assertPathExists(absolutePath: string) {
  try {
    await fs.access(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Target path does not exist.");
    }

    throw error;
  }
}

async function assertTargetAvailable(absolutePath: string) {
  try {
    await fs.access(absolutePath);
    throw new Error("Target path already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function normalizeComparableTitle(title: string) {
  return title.trim().toLowerCase();
}

async function findDuplicateArticleTitleConflicts(
  contentRoot: string,
  title: string,
  options?: { excludePath?: string }
) {
  const comparableTitle = normalizeComparableTitle(title);

  if (!comparableTitle) {
    return [];
  }

  const normalizedExcludePath = options?.excludePath ? normalizeRelativeEntryPath(options.excludePath) : null;
  const articles = await scanArticles(contentRoot);

  return articles
    .filter(
      (article) =>
        normalizeComparableTitle(article.title) === comparableTitle &&
        article.path !== normalizedExcludePath
    )
    .map((article) => ({
      path: article.path,
      title: article.title
    }));
}

async function assertNoDuplicateArticleTitle(
  contentRoot: string,
  title: string,
  options?: {
    allowDuplicateTitle?: boolean;
    excludePath?: string;
  }
) {
  if (options?.allowDuplicateTitle) {
    return;
  }

  const conflicts = await findDuplicateArticleTitleConflicts(contentRoot, title, {
    excludePath: options?.excludePath
  });

  if (conflicts.length > 0) {
    throw new DuplicateArticleTitleError(title, conflicts);
  }
}

function resolveArticleTitleForCreate(name: string, metadata?: Record<string, unknown>) {
  if (typeof metadata?.title === "string" && metadata.title.trim()) {
    return metadata.title.trim();
  }

  return titleFromFileName(name);
}

async function isDirectory(absolutePath: string) {
  const stats = await fs.stat(absolutePath);
  return stats.isDirectory();
}

export async function createFileSystemEntry(
  contentRoot: string,
  parentPath: string,
  entryType: "file" | "directory",
  name: string,
  metadata?: Record<string, unknown>,
  options?: {
    allowDuplicateTitle?: boolean;
  }
) {
  const normalizedParentPath = normalizeRelativeEntryPath(parentPath);
  const relativePath = joinRelativePath(normalizedParentPath, name);
  const absolutePath = resolveContentPath(contentRoot, relativePath);
  const absoluteParentPath = resolveContentPath(contentRoot, normalizedParentPath);

  await assertPathExists(absoluteParentPath);
  if (!(await isDirectory(absoluteParentPath))) {
    throw new Error("Parent path must be a directory.");
  }

  await assertTargetAvailable(absolutePath);

  if (entryType === "directory") {
    await fs.mkdir(absolutePath, { recursive: false });
    const directoryTags = normalizeTags(metadata?.tags);

    if (directoryTags.length > 0) {
      await writeDirectoryMetadataTags(contentRoot, relativePath, directoryTags);
    }

    return { path: relativePath };
  }

  if (relativePath.toLowerCase().endsWith(".md")) {
    await assertNoDuplicateArticleTitle(
      contentRoot,
      resolveArticleTitleForCreate(name, metadata),
      {
        allowDuplicateTitle: options?.allowDuplicateTitle
      }
    );
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const initialContent = relativePath.toLowerCase().endsWith(".md")
    ? buildArticleTemplate(name, {
        title: typeof metadata?.title === "string" ? metadata.title : undefined,
        tags: [
          ...(await loadDirectoryMetadataTags(contentRoot, normalizedParentPath)),
          ...normalizeTags(metadata?.tags)
        ].filter((tag, index, tags) => tags.indexOf(tag) === index),
        top: normalizeTop(metadata?.top)
      })
    : "";
  await fs.writeFile(absolutePath, initialContent, "utf8");
  return { path: relativePath };
}

export async function renameFileSystemEntry(
  contentRoot: string,
  relativePath: string,
  nextName: string,
  options?: {
    allowDuplicateTitle?: boolean;
    title?: string;
  }
) {
  const normalizedSourcePath = normalizeRelativeEntryPath(relativePath);
  const sourceAbsolutePath = resolveContentPath(contentRoot, normalizedSourcePath);
  await assertPathExists(sourceAbsolutePath);

  const parentPath = path.posix.dirname(normalizedSourcePath);
  const normalizedParentPath = parentPath === "." ? "" : parentPath;
  const nextRelativePath = joinRelativePath(normalizedParentPath, nextName);
  const nextAbsolutePath = resolveContentPath(contentRoot, nextRelativePath);

  if (normalizedSourcePath.toLowerCase().endsWith(".md")) {
    const currentArticle = await readArticle(contentRoot, normalizedSourcePath);
    const nextTitle =
      typeof options?.title === "string" && options.title.trim()
        ? options.title.trim()
        : currentArticle.title;

    await assertNoDuplicateArticleTitle(contentRoot, nextTitle, {
      allowDuplicateTitle: options?.allowDuplicateTitle,
      excludePath: normalizedSourcePath
    });
  }

  if (normalizedSourcePath === nextRelativePath) {
    return { path: normalizedSourcePath };
  }

  await assertTargetAvailable(nextAbsolutePath);
  await fs.rename(sourceAbsolutePath, nextAbsolutePath);
  return { path: nextRelativePath };
}

export async function deleteFileSystemEntry(contentRoot: string, relativePath: string) {
  const normalizedPath = normalizeRelativeEntryPath(relativePath);

  if (!normalizedPath) {
    throw new Error("The content root cannot be deleted.");
  }

  const absolutePath = resolveContentPath(contentRoot, normalizedPath);
  await assertPathExists(absolutePath);
  await fs.rm(absolutePath, { recursive: true, force: false });
}

export async function transferFileSystemEntry(
  contentRoot: string,
  sourcePath: string,
  targetDirectoryPath: string,
  mode: "copy" | "move"
) {
  const normalizedSourcePath = normalizeRelativeEntryPath(sourcePath);
  const normalizedTargetDirectory = normalizeRelativeEntryPath(targetDirectoryPath);
  const sourceAbsolutePath = resolveContentPath(contentRoot, normalizedSourcePath);
  const targetDirectoryAbsolutePath = resolveContentPath(contentRoot, normalizedTargetDirectory);

  await assertPathExists(sourceAbsolutePath);
  await assertPathExists(targetDirectoryAbsolutePath);

  if (!(await isDirectory(targetDirectoryAbsolutePath))) {
    throw new Error("Paste target must be a directory.");
  }

  const targetRelativePath = joinRelativePath(
    normalizedTargetDirectory,
    path.posix.basename(normalizedSourcePath)
  );

  if (targetRelativePath === normalizedSourcePath) {
    throw new Error(`Cannot ${mode} an entry onto itself.`);
  }

  if (
    mode === "move" &&
    targetRelativePath.startsWith(`${normalizedSourcePath}/`)
  ) {
    throw new Error("Cannot move a directory into one of its descendants.");
  }

  const targetAbsolutePath = resolveContentPath(contentRoot, targetRelativePath);
  await assertTargetAvailable(targetAbsolutePath);

  if (mode === "copy") {
    await fs.cp(sourceAbsolutePath, targetAbsolutePath, {
      errorOnExist: true,
      force: false,
      recursive: true
    });
  } else {
    await fs.rename(sourceAbsolutePath, targetAbsolutePath);
  }

  return { path: targetRelativePath };
}

export async function ensureContentRoot(contentRoot: string) {
  await fs.mkdir(contentRoot, { recursive: true });
}
