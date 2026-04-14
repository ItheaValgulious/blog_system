import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorkspacePaths } from "@blog-system/content-core/node";
import { loadSiteData, scanArticles } from "@blog-system/content-core/node";

import { sitePlugins } from "./plugins.js";
import { createWriteHtml, createWriteTextAsset, normalizeBasePath, type SiteBuildContext } from "./runtime.js";
import { loadSiteConfig } from "./site-config.js";
import { buildSiteCss } from "./styles.js";
import { loadSiteThemeConfig } from "./theme-config.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, "../../..");
const workspacePaths = loadWorkspacePaths(projectRoot);

export interface SiteBuildSettings {
  assetsRoot: string;
  configRoot: string;
  contentRoot: string;
  distDir: string;
  projectRoot: string;
  workspaceRoot: string;
  basePath: string;
}

export function getSiteSettings(): SiteBuildSettings {
  return {
    assetsRoot: workspacePaths.assetsRoot,
    configRoot: workspacePaths.configRoot,
    contentRoot: workspacePaths.contentRoot,
    distDir: path.resolve(path.join(projectRoot, "apps", "site", "dist")),
    projectRoot,
    workspaceRoot: workspacePaths.workspaceRoot,
    basePath: process.env.SITE_BASE_PATH ?? ""
  };
}

async function copyContentAssets(contentRoot: string, distDir: string) {
  const targetRoot = path.join(distDir, "content");

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });

  async function walk(sourceDir: string, relativeDir = ""): Promise<void> {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetRoot, relativePath);

      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await walk(sourcePath, relativePath);
      } else if (!entry.name.toLowerCase().endsWith(".md") && !entry.name.startsWith(".blog-system-folder")) {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  await walk(contentRoot);
}

async function copyMediaLibrary(assetsRoot: string, distDir: string) {
  const sourceRoot = assetsRoot;
  const targetRoot = path.join(distDir, "media");

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });

  try {
    await fs.access(sourceRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true });
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function buildNotFoundPage(context: SiteBuildContext) {
  const navigation = sitePlugins
    .filter((plugin) => context.config.enabledPlugins.includes(plugin.id))
    .map((plugin) => plugin.getNavigationItem?.(context))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const html = context.theme.renderPage({
    basePath: context.basePrefix,
    content: `<section class="hero-panel"><h1>404</h1><p>The page could not be found.</p></section>`,
    description: "The page could not be found.",
    navigation,
    siteDescription: context.config.siteDescription,
    siteTitle: context.config.siteTitle,
    title: "404 - Not Found"
  });

  await context.writeHtml("404.html", html);
}

export async function buildSite(customSettings?: Partial<SiteBuildSettings>) {
  const settings = {
    ...getSiteSettings(),
    ...customSettings
  };
  const config = await loadSiteConfig(settings.configRoot);
  const themePlugin =
    sitePlugins.find((candidate) => candidate.kind === "theme" && candidate.id === config.theme) ??
    sitePlugins.find((candidate) => candidate.kind === "theme");

  if (!themePlugin || themePlugin.kind !== "theme") {
    throw new Error(`Theme plugin "${config.theme}" could not be resolved.`);
  }

  const theme = themePlugin.theme;
  const basePrefix = normalizeBasePath(settings.basePath);
  const themeConfig = await loadSiteThemeConfig(settings.configRoot, theme.id);

  await fs.rm(settings.distDir, { recursive: true, force: true });
  await fs.mkdir(path.join(settings.distDir, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(settings.distDir, "assets", "site.css"),
    buildSiteCss(themeConfig, config, basePrefix),
    "utf8"
  );
  await copyContentAssets(settings.contentRoot, settings.distDir);
  await copyMediaLibrary(settings.assetsRoot, settings.distDir);

  const siteData = await loadSiteData(settings.contentRoot, basePrefix);
  const publishedArticles = (await scanArticles(settings.contentRoot)).filter((article) => article.status === "published");
  const context: SiteBuildContext = {
    basePrefix,
    config,
    projectRoot: settings.projectRoot,
    publishedArticles,
    settings,
    siteData,
    theme,
    writeHtml: createWriteHtml(settings),
    writeTextAsset: createWriteTextAsset(settings)
  };

  for (const plugin of sitePlugins.filter((candidate) => candidate.kind === "data" && config.enabledPlugins.includes(candidate.id))) {
    await plugin.run(context);
  }

  await fs.writeFile(
    path.join(settings.distDir, "assets", "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#1f2937"/><path d="M18 16h18c7.732 0 14 6.268 14 14s-6.268 14-14 14H26v8H18V16z" fill="#c2410c"/><path d="M26 24v12h10c3.314 0 6-2.686 6-6s-2.686-6-6-6H26z" fill="#fff7ed"/></svg>\n`,
    "utf8"
  );

  for (const plugin of sitePlugins.filter((candidate) => candidate.kind === "page" && config.enabledPlugins.includes(candidate.id))) {
    await plugin.run(context);
  }

  await buildNotFoundPage(context);

  return settings.distDir;
}
