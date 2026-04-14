import { promises as fs } from "node:fs";
import path from "node:path";

export interface SiteThemeConfig {
  backgroundImage?: string;
  colors: {
    accent: string;
    accentAlt: string;
    background: string;
    foreground: string;
    line: string;
    muted: string;
    paper: string;
    shadow: string;
  };
}

export const defaultAtlasThemeConfig: SiteThemeConfig = {
  backgroundImage: "",
  colors: {
    accent: "#c2410c",
    accentAlt: "#0f766e",
    background: "#f5f1e8",
    foreground: "#1f2937",
    line: "rgba(31, 41, 55, 0.12)",
    muted: "#52606d",
    paper: "rgba(255, 251, 245, 0.94)",
    shadow: "0 22px 60px rgba(31, 41, 55, 0.12)"
  }
};

export async function loadSiteThemeConfig(configRoot: string, themeId: string) {
  const configPath = path.join(configRoot, `site-theme.${themeId}.json`);
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SiteThemeConfig>;

  return {
    backgroundImage: parsed.backgroundImage?.trim() || "",
    colors: {
      ...defaultAtlasThemeConfig.colors,
      ...(parsed.colors ?? {})
    }
  };
}
