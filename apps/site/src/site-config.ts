import { promises as fs } from "node:fs";
import path from "node:path";

export interface SiteConfig {
  about: {
    body: string;
    title: string;
  };
  backgroundImage?: string;
  enabledPlugins: string[];
  siteDescription: string;
  siteTitle: string;
  theme: string;
}

export const defaultSiteConfig: SiteConfig = {
  about: {
    title: "About",
    body: "Write your About page content here."
  },
  backgroundImage: "",
  enabledPlugins: ["top-order", "home", "article-pages", "tags", "tree", "about", "search"],
  siteDescription: "A plugin-driven static site generated from local Markdown content.",
  siteTitle: "Knowledge Base",
  theme: "atlas"
};

export async function loadSiteConfig(configRoot: string): Promise<SiteConfig> {
  const configPath = path.join(configRoot, "site.json");
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SiteConfig>;

  return {
    about: {
      title: parsed.about?.title?.trim() || defaultSiteConfig.about.title,
      body: parsed.about?.body ?? defaultSiteConfig.about.body
    },
    backgroundImage: parsed.backgroundImage?.trim() || "",
    enabledPlugins:
      parsed.enabledPlugins?.filter((pluginId): pluginId is string => typeof pluginId === "string" && pluginId.trim().length > 0) ??
      defaultSiteConfig.enabledPlugins,
    siteDescription: parsed.siteDescription?.trim() || defaultSiteConfig.siteDescription,
    siteTitle: parsed.siteTitle?.trim() || defaultSiteConfig.siteTitle,
    theme: parsed.theme?.trim() || defaultSiteConfig.theme
  };
}
