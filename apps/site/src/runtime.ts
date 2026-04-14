import { promises as fs } from "node:fs";
import path from "node:path";

import type { ArticleRecord, SiteData } from "@blog-system/content-core";

import type { SiteBuildSettings } from "./generator.js";
import type { SiteConfig } from "./site-config.js";

export interface SiteNavigationItem {
  href: string;
  label: string;
}

export interface SiteThemeRenderArgs {
  basePath: string;
  bodyClass?: string;
  content: string;
  description: string;
  headerMode?: "brand" | "nav-only";
  navigation: SiteNavigationItem[];
  siteDescription: string;
  siteTitle: string;
  title: string;
}

export interface SiteThemeDefinition {
  id: string;
  label: string;
  renderPage: (args: SiteThemeRenderArgs) => string;
}

export interface SiteBuildContext {
  basePrefix: string;
  config: SiteConfig;
  projectRoot: string;
  publishedArticles: ArticleRecord[];
  settings: SiteBuildSettings;
  siteData: SiteData;
  theme: SiteThemeDefinition;
  writeHtml: (relativePath: string, html: string) => Promise<void>;
  writeTextAsset: (relativePath: string, content: string) => Promise<void>;
}

export interface SiteBaseExtensionDefinition {
  id: string;
  label: string;
}

export interface SiteDataPluginDefinition extends SiteBaseExtensionDefinition {
  kind: "data";
  run: (context: SiteBuildContext) => Promise<void> | void;
}

export interface SitePagePluginDefinition extends SiteBaseExtensionDefinition {
  kind: "page";
  getNavigationItem?: (context: SiteBuildContext) => SiteNavigationItem | null;
  run: (context: SiteBuildContext) => Promise<void> | void;
}

export interface SiteThemePluginDefinition extends SiteBaseExtensionDefinition {
  kind: "theme";
  theme: SiteThemeDefinition;
}

export type SitePluginDefinition =
  | SiteDataPluginDefinition
  | SitePagePluginDefinition
  | SiteThemePluginDefinition;

export function normalizeBasePath(basePath: string) {
  return basePath ? `/${basePath.replace(/^\/+|\/+$/g, "")}` : "";
}

export function createWriteHtml(settings: SiteBuildSettings) {
  return async (relativePath: string, html: string) => {
    const targetPath = path.join(settings.distDir, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, html, "utf8");
  };
}

export function createWriteTextAsset(settings: SiteBuildSettings) {
  return async (relativePath: string, content: string) => {
    const targetPath = path.join(settings.distDir, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
  };
}
