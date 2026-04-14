import { resolveManagedMediaPath } from "@blog-system/content-core";

import type { SiteConfig } from "./site-config.js";
import type { SiteThemeConfig } from "./theme-config.js";

export function buildSiteCss(themeConfig: SiteThemeConfig, siteConfig: SiteConfig, basePrefix: string) {
  const backgroundImage = siteConfig.backgroundImage
    ? resolveManagedMediaPath(siteConfig.backgroundImage, `${basePrefix}/media`)
    : "";
  const backgroundLayers = backgroundImage
    ? `url("${backgroundImage}") center / 100% 100% no-repeat fixed, var(--bg);`
    : `var(--bg);`;

  return `
:root {
  color-scheme: light;
  --bg: ${themeConfig.colors.background};
  --paper: ${themeConfig.colors.paper};
  --ink: ${themeConfig.colors.foreground};
  --muted: ${themeConfig.colors.muted};
  --accent: ${themeConfig.colors.accent};
  --accent-2: ${themeConfig.colors.accentAlt};
  --line: ${themeConfig.colors.line};
  --shadow: ${themeConfig.colors.shadow};
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: ${backgroundLayers}
  color: var(--ink);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

a { color: inherit; }
img { max-width: 100%; display: block; }
.site-shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 20px 0 56px; }
.site-header, .site-footer, .hero-panel, .content-panel, .article-panel, .side-panel, .post-card { border: 1px solid var(--line); border-radius: 24px; background: var(--paper); box-shadow: var(--shadow); }
.site-header, .site-footer { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 18px 22px; }
.site-brand { font-family: "Iowan Old Style", "Palatino Linotype", serif; font-size: 1.6rem; font-weight: 700; text-decoration: none; }
.site-nav { display: flex; flex-wrap: wrap; gap: 14px; }
.site-nav.centered { justify-content: center; width: 100%; }
.site-header.nav-only { justify-content: center; }
.site-nav a { text-decoration: none; color: var(--muted); }
.site-nav a:hover { color: var(--accent); }
.page-shell { display: flex; flex-direction: column; gap: 20px; padding-top: 20px; }
.hero-panel { padding: 28px 30px; }
.hero-panel h1 { font-family: "Iowan Old Style", "Palatino Linotype", serif; font-size: clamp(2rem, 4vw, 3.4rem); margin: 0 0 10px; }
.content-panel { padding: 22px; display: grid; gap: 18px; }
.post-card { padding: 20px; }
.post-card h2 { margin: 0 0 10px; font-family: "Iowan Old Style", "Palatino Linotype", serif; }
.post-card h2 a { text-decoration: none; }
.meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; color: var(--muted); font-size: 0.9rem; }
.tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); text-decoration: none; font-size: 0.82rem; }
.article-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; }
.article-panel, .side-panel { padding: 24px; }
.side-panel { position: sticky; top: 20px; height: fit-content; }
.prose { line-height: 1.85; }
.prose h1, .prose h2, .prose h3 { font-family: "Iowan Old Style", "Palatino Linotype", serif; margin-top: 1.8em; }
.prose pre { overflow: auto; padding: 18px; border-radius: 18px; background: #0f172a; color: #e2e8f0; }
.prose img { border-radius: 18px; border: 1px solid var(--line); }
.pager-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 28px; }
.tree-list { margin: 0; padding-left: 20px; }
.search-input { width: 100%; min-height: 42px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.8); color: var(--ink); }

@media (max-width: 980px) {
  .site-header, .site-footer, .article-layout, .pager-row { grid-template-columns: 1fr; flex-direction: column; align-items: flex-start; }
  .side-panel { position: static; }
}
`;
}
