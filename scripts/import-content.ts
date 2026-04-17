import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  parseArticleSource,
  serializeArticle,
  toPosixPath,
  type ArticleStatus
} from "@blog-system/content-core";
import { loadWorkspacePaths } from "@blog-system/content-core/node";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

interface CliOptions {
  imgFolderPath: string | null;
  sourcePath: string;
  statusOverride: ArticleStatus | null;
}

interface TextReplacement {
  start: number;
  end: number;
  value: string;
}

interface RewrittenMarkdownFile {
  destinationMarkdownPath: string;
  rewrittenContent: string;
}

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp"
]);

function printUsage() {
  console.log("Usage: npm run import-content -- <path> [--status draft|published] [--img-folder <path>]");
}

function parseStatus(value: string): ArticleStatus {
  if (value === "draft" || value === "published") {
    return value;
  }

  throw new Error(`Unsupported status "${value}". Use "draft" or "published".`);
}

function parseCliOptions(argv: string[]): CliOptions {
  let imgFolderPath: string | null = null;
  let sourcePath: string | null = null;
  let statusOverride: ArticleStatus | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    }

    if (argument === "--status") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("Missing value for --status.");
      }

      statusOverride = parseStatus(nextValue);
      index += 1;
      continue;
    }

    if (argument === "--img-folder") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("Missing value for --img-folder.");
      }

      imgFolderPath = path.resolve(nextValue);
      index += 1;
      continue;
    }

    if (argument.startsWith("--status=")) {
      statusOverride = parseStatus(argument.slice("--status=".length));
      continue;
    }

    if (argument.startsWith("--img-folder=")) {
      imgFolderPath = path.resolve(argument.slice("--img-folder=".length));
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option "${argument}".`);
    }

    if (sourcePath) {
      throw new Error("Only one source path can be imported at a time.");
    }

    sourcePath = argument;
  }

  if (!sourcePath) {
    throw new Error("A source path is required.");
  }

  return {
    imgFolderPath,
    sourcePath,
    statusOverride
  };
}

function normalizeCaseSensitivePath(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(candidatePath: string, containerPath: string) {
  const normalizedCandidate = normalizeCaseSensitivePath(candidatePath);
  const normalizedContainer = normalizeCaseSensitivePath(containerPath);
  const relativePath = path.relative(normalizedContainer, normalizedCandidate);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function copyPath(sourcePath: string, destinationPath: string) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.cp(sourcePath, destinationPath, {
    recursive: true,
    errorOnExist: true,
    force: false
  });
}

async function collectMarkdownFiles(targetPath: string): Promise<string[]> {
  const stats = await fs.stat(targetPath);

  if (stats.isFile()) {
    if (!targetPath.toLowerCase().endsWith(".md")) {
      throw new Error("Only Markdown files or directories can be imported.");
    }

    return [targetPath];
  }

  if (!stats.isDirectory()) {
    throw new Error("The source path must point to a Markdown file or a directory.");
  }

  const markdownFiles: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        markdownFiles.push(nextPath);
      }
    }
  }

  await walk(targetPath);
  markdownFiles.sort((left, right) => left.localeCompare(right));
  return markdownFiles;
}

function splitResourceReference(value: string) {
  const match = /^([^?#]+)(.*)$/.exec(value.trim());

  return {
    pathPart: match?.[1] ?? value.trim(),
    suffix: match?.[2] ?? ""
  };
}

function isAbsoluteFileReference(value: string) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function resolveLocalImagePath(articlePath: string, rawUrl: string, imgFolderPath: string | null) {
  const { pathPart } = splitResourceReference(rawUrl);

  if (!pathPart) {
    return null;
  }

  if (pathPart.startsWith("@media/") || pathPart.startsWith("#") || pathPart.startsWith("data:")) {
    return null;
  }

  if (/^[a-z]+:\/\/.+/i.test(pathPart) || pathPart.startsWith("//")) {
    return null;
  }

  const resolvedPath = pathPart.startsWith("/") && imgFolderPath
    ? path.resolve(imgFolderPath, pathPart.replace(/^\/+/, ""))
    : isAbsoluteFileReference(pathPart)
      ? path.resolve(pathPart)
      : path.resolve(path.dirname(articlePath), pathPart);

  if (!IMAGE_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
    return null;
  }

  return resolvedPath;
}

function replaceFirstOccurrence(source: string, searchValue: string, replacement: string) {
  const startIndex = source.indexOf(searchValue);

  if (startIndex === -1) {
    return source;
  }

  return `${source.slice(0, startIndex)}${replacement}${source.slice(startIndex + searchValue.length)}`;
}

function applyTextReplacements(source: string, replacements: TextReplacement[]) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (currentSource, replacement) =>
        `${currentSource.slice(0, replacement.start)}${replacement.value}${currentSource.slice(replacement.end)}`,
      source
    );
}

async function storeManagedAsset(
  assetsRoot: string,
  sourcePath: string,
  cache: Map<string, string>
): Promise<string> {
  const normalizedSourcePath = path.resolve(sourcePath);
  const cachedRef = cache.get(normalizedSourcePath);

  if (cachedRef) {
    return cachedRef;
  }

  const binary = await fs.readFile(normalizedSourcePath);
  const extension = path.extname(normalizedSourcePath).toLowerCase() || ".png";
  const fileName = `${createHash("sha256").update(binary).digest("hex")}${extension}`;
  const destinationPath = path.join(assetsRoot, fileName);

  await fs.mkdir(assetsRoot, { recursive: true });

  if (!(await pathExists(destinationPath))) {
    await fs.writeFile(destinationPath, binary);
  }

  const managedReference = `@media/${fileName}`;
  cache.set(normalizedSourcePath, managedReference);
  return managedReference;
}

async function rewriteHtmlAssetAttributes(
  source: string,
  articlePath: string,
  resolveManagedReference: (rawUrl: string) => Promise<string | null>
) {
  const uniqueUrls = new Set<string>();

  for (const match of source.matchAll(/\b(?:src|href)=("([^"]+)"|'([^']+)')/gi)) {
    const originalUrl = match[2] ?? match[3] ?? "";

    if (originalUrl) {
      uniqueUrls.add(originalUrl);
    }
  }

  const replacementsByUrl = new Map<string, string>();

  for (const originalUrl of uniqueUrls) {
    const nextUrl = await resolveManagedReference(originalUrl);

    if (nextUrl) {
      replacementsByUrl.set(originalUrl, nextUrl);
    }
  }

  if (replacementsByUrl.size === 0) {
    return source;
  }

  return source.replace(/\b(src|href)=("([^"]+)"|'([^']+)')/gi, (match, attribute, quotedValue, doubleQuoted, singleQuoted) => {
    const originalUrl = doubleQuoted ?? singleQuoted ?? "";
    const nextUrl = replacementsByUrl.get(originalUrl);

    if (!nextUrl) {
      return match;
    }

    const quote = quotedValue.startsWith("'") ? "'" : "\"";
    return `${attribute}=${quote}${nextUrl}${quote}`;
  });
}

async function rewriteMarkdownFile(
  rawContent: string,
  articlePath: string,
  assetsRoot: string,
  assetCache: Map<string, string>,
  imgFolderPath: string | null
) {
  const replacements: TextReplacement[] = [];
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(rawContent) as any;

  const resolveManagedReference = async (rawUrl: string) => {
    const localImagePath = resolveLocalImagePath(articlePath, rawUrl, imgFolderPath);

    if (!localImagePath) {
      return null;
    }

    if (!(await pathExists(localImagePath))) {
      throw new Error(`Referenced image "${rawUrl}" in "${articlePath}" could not be found.`);
    }

    return storeManagedAsset(assetsRoot, localImagePath, assetCache);
  };

  const pendingReplacements: Array<Promise<void>> = [];

  visit(tree, (node: any) => {
    const startOffset = node?.position?.start?.offset;
    const endOffset = node?.position?.end?.offset;

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return;
    }

    const safeStart = Number(startOffset);
    const safeEnd = Number(endOffset);

    if (safeEnd <= safeStart) {
      return;
    }

    if ((node.type === "image" || node.type === "link") && typeof node.url === "string") {
      pendingReplacements.push(
        (async () => {
          const nextUrl = await resolveManagedReference(node.url);

          if (!nextUrl) {
            return;
          }

          const sourceSlice = rawContent.slice(safeStart, safeEnd);
          const rewrittenSlice = replaceFirstOccurrence(sourceSlice, node.url, nextUrl);

          if (rewrittenSlice !== sourceSlice) {
            replacements.push({
              start: safeStart,
              end: safeEnd,
              value: rewrittenSlice
            });
          }
        })()
      );
      return;
    }

    if (node.type === "html" && typeof node.value === "string") {
      pendingReplacements.push(
        (async () => {
          const sourceSlice = rawContent.slice(safeStart, safeEnd);
          const rewrittenSlice = await rewriteHtmlAssetAttributes(
            sourceSlice,
            articlePath,
            resolveManagedReference
          );

          if (rewrittenSlice !== sourceSlice) {
            replacements.push({
              start: safeStart,
              end: safeEnd,
              value: rewrittenSlice
            });
          }
        })()
      );
    }
  });

  await Promise.all(pendingReplacements);

  return {
    rewrittenContent: applyTextReplacements(rawContent, replacements)
  };
}

function applyStatusOverride(relativePath: string, rawContent: string, statusOverride: ArticleStatus | null) {
  if (!statusOverride) {
    return rawContent;
  }

  const article = parseArticleSource(relativePath, rawContent);
  const nextFrontmatter = {
    ...article.frontmatter,
    status: statusOverride,
    date:
      statusOverride === "published" &&
      article.status !== "published" &&
      !article.frontmatter.date
        ? new Date().toISOString()
        : article.frontmatter.date
  };

  return serializeArticle({
    frontmatter: nextFrontmatter,
    body: article.body
  });
}

async function importContent(options: CliOptions) {
  const projectRoot = process.cwd();
  const workspacePaths = loadWorkspacePaths(projectRoot);
  const sourcePath = path.resolve(options.sourcePath);

  if (!path.basename(sourcePath)) {
    throw new Error("The source path must have a basename.");
  }

  if (isPathInside(sourcePath, workspacePaths.contentRoot)) {
    throw new Error("The source path is already inside the content directory.");
  }

  const sourceStats = await fs.stat(sourcePath);
  const sourceIsDirectory = sourceStats.isDirectory();
  const destinationRootPath = path.join(workspacePaths.contentRoot, path.basename(sourcePath));

  if (await pathExists(destinationRootPath)) {
    throw new Error(`The destination "${destinationRootPath}" already exists.`);
  }

  const markdownFiles = await collectMarkdownFiles(sourcePath);
  const assetCache = new Map<string, string>();
  const rewrittenMarkdownFiles: RewrittenMarkdownFile[] = [];

  for (const markdownFile of markdownFiles) {
    const rawContent = await fs.readFile(markdownFile, "utf8");
    const rewritten = await rewriteMarkdownFile(
      rawContent,
      markdownFile,
      workspacePaths.assetsRoot,
      assetCache,
      options.imgFolderPath
    );
    const relativeFilePath = sourceIsDirectory ? path.relative(sourcePath, markdownFile) : path.basename(markdownFile);
    const destinationMarkdownPath = sourceIsDirectory
      ? path.join(destinationRootPath, relativeFilePath)
      : destinationRootPath;
    const articleRelativePath = toPosixPath(path.relative(workspacePaths.contentRoot, destinationMarkdownPath));

    rewrittenMarkdownFiles.push({
      destinationMarkdownPath,
      rewrittenContent: applyStatusOverride(articleRelativePath, rewritten.rewrittenContent, options.statusOverride)
    });
  }

  await fs.mkdir(workspacePaths.contentRoot, { recursive: true });
  await fs.mkdir(workspacePaths.assetsRoot, { recursive: true });
  await copyPath(sourcePath, destinationRootPath);

  for (const rewrittenMarkdownFile of rewrittenMarkdownFiles) {
    await fs.writeFile(
      rewrittenMarkdownFile.destinationMarkdownPath,
      rewrittenMarkdownFile.rewrittenContent,
      "utf8"
    );
  }

  console.log(`Copied "${sourcePath}" into "${destinationRootPath}".`);
  console.log(`Rewritten Markdown files: ${rewrittenMarkdownFiles.length}`);
  console.log(`Managed media assets: ${assetCache.size}`);

  if (options.statusOverride) {
    console.log(`Applied status override: ${options.statusOverride}`);
  }

  if (options.imgFolderPath) {
    console.log(`Applied image folder prefix: ${options.imgFolderPath}`);
  }
}

async function main() {
  try {
    await importContent(parseCliOptions(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    printUsage();
    process.exitCode = 1;
  }
}

void main();
