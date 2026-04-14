import {
  renderMarkdownWithKatex,
  rewriteManagedMediaUrls,
  rewriteRelativeAssetUrls,
  type ArticleSummary
} from "@blog-system/content-core";

import type { SitePluginDefinition, SiteThemePluginDefinition } from "./runtime.js";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTagRow(article: ArticleSummary, basePath: string) {
  return article.tags
    .map(
      (tag) =>
        `<a class="tag-chip" href="${basePath}/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`
    )
    .join("");
}

function renderArticleCard(article: ArticleSummary, basePath: string) {
  return `<article class="post-card">
    <h2><a href="${article.urlPath}">${escapeHtml(article.title)}</a></h2>
    <div class="meta-row">
      <span>${escapeHtml(article.status)}</span>
      <span>top ${article.top}</span>
      ${article.date ? `<span>${escapeHtml(article.date.slice(0, 10))}</span>` : ""}
    </div>
    <p>${escapeHtml(article.excerpt)}</p>
    <div class="tag-row">${renderTagRow(article, basePath)}</div>
  </article>`;
}

const atlasTheme = {
  id: "atlas",
  label: "Atlas",
  renderPage({ basePath, bodyClass, content, description, headerMode = "brand", navigation, siteDescription, siteTitle, title }) {
    const headerContent =
      headerMode === "nav-only"
        ? `<header class="site-header nav-only">
            <nav class="site-nav centered">
              ${navigation.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
            </nav>
          </header>`
        : `<header class="site-header">
            <div>
              <a class="site-brand" href="${basePath}/">${escapeHtml(siteTitle)}</a>
            </div>
            <nav class="site-nav">
              ${navigation.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
            </nav>
          </header>`;

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="stylesheet" href="${basePath}/assets/site.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
  </head>
  <body class="${bodyClass ?? ""}">
    <div class="site-shell">
      ${headerContent}
      <main class="page-shell">
        ${content}
      </main>
      <footer class="site-footer">
        <span>${escapeHtml(siteTitle)}</span>
        <span>${escapeHtml(description)}</span>
      </footer>
    </div>
  </body>
</html>`;
  }
};

export const atlasThemePlugin: SiteThemePluginDefinition = {
  id: "atlas",
  kind: "theme",
  label: "Atlas Theme",
  theme: atlasTheme
};

export const topOrderPlugin: SitePluginDefinition = {
  id: "top-order",
  kind: "data",
  label: "Top Order",
  run(context) {
    const compare = (left: ArticleSummary, right: ArticleSummary) => {
      if (left.top !== right.top) {
        return right.top - left.top;
      }

      const leftDate = left.date ? Date.parse(left.date) : 0;
      const rightDate = right.date ? Date.parse(right.date) : 0;

      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }

      return left.path.localeCompare(right.path);
    };

    context.siteData.articles.sort(compare);
    context.publishedArticles.sort((left, right) => {
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
    for (const directory of context.siteData.directories) {
      directory.articles.sort(compare);
    }
  }
};

export const homePlugin: SitePluginDefinition = {
  id: "home",
  kind: "page",
  label: "Home",
  getNavigationItem: (context) => ({
    href: `${context.basePrefix}/`,
    label: "Home"
  }),
  async run(context) {
    const navigation = enabledNavigation(context);
    const body = `<section class="hero-panel">
      <h1>${escapeHtml(context.config.siteTitle)}</h1>
      <p>${escapeHtml(context.config.siteDescription)}</p>
    </section>
    <section class="content-panel">
      ${context.siteData.articles.map((article) => renderArticleCard(article, context.basePrefix)).join("")}
    </section>`;

    await context.writeHtml(
      "index.html",
      context.theme.renderPage({
        basePath: context.basePrefix,
        content: body,
        description: context.config.siteDescription,
        headerMode: "nav-only",
        navigation,
        siteDescription: context.config.siteDescription,
        siteTitle: context.config.siteTitle,
        title: context.config.siteTitle
      })
    );
  }
};

export const articlePagesPlugin: SitePluginDefinition = {
  id: "article-pages",
  kind: "page",
  label: "Article Pages",
  async run(context) {
    const navigation = enabledNavigation(context);

    await Promise.all(
      context.publishedArticles.map(async (record, index) => {
        const summary = context.siteData.articles.find((article) => article.path === record.path)!;
        const rendered = await renderMarkdownWithKatex(record.body);
        const html = rewriteManagedMediaUrls(
          rewriteRelativeAssetUrls(rendered.html, record.directory, `${context.basePrefix}/content`),
          `${context.basePrefix}/media`
        );
        const previous = context.siteData.articles[index + 1];
        const next = context.siteData.articles[index - 1];
        const body = `<section class="hero-panel">
          <h1>${escapeHtml(summary.title)}</h1>
          <div class="meta-row">
            <span>${escapeHtml(summary.status)}</span>
            <span>top ${summary.top}</span>
            ${summary.date ? `<span>${escapeHtml(summary.date.slice(0, 10))}</span>` : ""}
          </div>
          <div class="tag-row">${renderTagRow(summary, context.basePrefix)}</div>
        </section>
        <section class="article-layout">
          <article class="article-panel">
            <div class="prose">${html}</div>
            <div class="pager-row">
              ${previous ? `<a href="${previous.urlPath}">Older: ${escapeHtml(previous.title)}</a>` : "<span></span>"}
              ${next ? `<a href="${next.urlPath}">Newer: ${escapeHtml(next.title)}</a>` : "<span></span>"}
            </div>
          </article>
          <aside class="side-panel">
            <h3>On This Page</h3>
            <ul>${rendered.headings.map((heading) => `<li><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join("")}</ul>
          </aside>
        </section>`;

        await context.writeHtml(
          `${summary.urlPath.replace(context.basePrefix, "").replace(/^\/+/, "")}index.html`,
          context.theme.renderPage({
            basePath: context.basePrefix,
            content: body,
            description: summary.excerpt,
            navigation,
            siteDescription: context.config.siteDescription,
            siteTitle: context.config.siteTitle,
            title: summary.title
          })
        );
      })
    );
  }
};

export const tagsPlugin: SitePluginDefinition = {
  id: "tags",
  kind: "page",
  label: "Tags",
  getNavigationItem: (context) => ({
    href: `${context.basePrefix}/tags/`,
    label: "Tags"
  }),
  async run(context) {
    const navigation = enabledNavigation(context);
    const tagIndexBody = `<section class="hero-panel"><h1>Tags</h1></section>
      <section class="content-panel">${context.siteData.tags
        .map(
          (tag) =>
            `<a class="tag-chip" href="${context.basePrefix}/tags/${encodeURIComponent(tag.tag)}/">${escapeHtml(tag.tag)} (${tag.count})</a>`
        )
        .join("")}</section>`;
    await context.writeHtml(
      "tags/index.html",
      context.theme.renderPage({
        basePath: context.basePrefix,
        content: tagIndexBody,
        description: "Browse articles by tag.",
        navigation,
        siteDescription: context.config.siteDescription,
        siteTitle: context.config.siteTitle,
        title: "Tags"
      })
    );

    await Promise.all(
      context.siteData.tags.map(async (tag) => {
        const matchingArticles = context.siteData.articles.filter((article) => article.tags.includes(tag.tag));
        const body = `<section class="hero-panel"><h1># ${escapeHtml(tag.tag)}</h1></section>
          <section class="content-panel">${matchingArticles
            .map((article) => renderArticleCard(article, context.basePrefix))
            .join("")}</section>`;
        await context.writeHtml(
          `tags/${encodeURIComponent(tag.tag)}/index.html`,
          context.theme.renderPage({
            basePath: context.basePrefix,
            content: body,
            description: `Articles tagged with ${tag.tag}.`,
            navigation,
            siteDescription: context.config.siteDescription,
            siteTitle: context.config.siteTitle,
            title: `Tag: ${tag.tag}`
          })
        );
      })
    );
  }
};

function flattenDirectories(directories: typeof import("@blog-system/content-core").SiteDirectoryPage[]) {
  return directories.flatMap((directory) => [directory, ...flattenDirectories(directory.children)]);
}

function renderDirectoryTree(directories: typeof import("@blog-system/content-core").SiteDirectoryPage[]) {
  return `<ul class="tree-list">${directories
    .map(
      (directory) => `<li><a href="${directory.urlPath}">${escapeHtml(directory.name)}</a>${directory.children.length > 0 ? renderDirectoryTree(directory.children) : ""}</li>`
    )
    .join("")}</ul>`;
}

export const treePlugin: SitePluginDefinition = {
  id: "tree",
  kind: "page",
  label: "Directory Tree",
  getNavigationItem: (context) => ({
    href: `${context.basePrefix}/tree/`,
    label: "Tree"
  }),
  async run(context) {
    const navigation = enabledNavigation(context);
    await context.writeHtml(
      "tree/index.html",
      context.theme.renderPage({
        basePath: context.basePrefix,
        content: `<section class="hero-panel"><h1>Directory Tree</h1></section><section class="content-panel">${renderDirectoryTree(context.siteData.directories)}</section>`,
        description: "Browse the content tree.",
        navigation,
        siteDescription: context.config.siteDescription,
        siteTitle: context.config.siteTitle,
        title: "Directory Tree"
      })
    );

    await Promise.all(
      flattenDirectories(context.siteData.directories).map(async (directory) => {
        const body = `<section class="hero-panel"><h1>${escapeHtml(directory.path)}</h1></section>
          <section class="content-panel">${directory.articles
            .map((article) => renderArticleCard(article, context.basePrefix))
            .join("") || "<p>No published articles here yet.</p>"}</section>`;
        await context.writeHtml(
          `tree/${directory.path}/index.html`,
          context.theme.renderPage({
            basePath: context.basePrefix,
            content: body,
            description: `Directory ${directory.path}.`,
            navigation,
            siteDescription: context.config.siteDescription,
            siteTitle: context.config.siteTitle,
            title: directory.path
          })
        );
      })
    );
  }
};

export const aboutPlugin: SitePluginDefinition = {
  id: "about",
  kind: "page",
  label: "About",
  getNavigationItem: (context) => ({
    href: `${context.basePrefix}/about/`,
    label: context.config.about.title
  }),
  async run(context) {
    const navigation = enabledNavigation(context);
    const rendered = await renderMarkdownWithKatex(context.config.about.body);
    const body = `<section class="hero-panel"><h1>${escapeHtml(context.config.about.title)}</h1></section>
      <section class="article-panel"><div class="prose">${rendered.html}</div></section>`;
    await context.writeHtml(
      "about/index.html",
      context.theme.renderPage({
        basePath: context.basePrefix,
        content: body,
        description: context.config.siteDescription,
        navigation,
        siteDescription: context.config.siteDescription,
        siteTitle: context.config.siteTitle,
        title: context.config.about.title
      })
    );
  }
};

export const searchPlugin: SitePluginDefinition = {
  id: "search",
  kind: "page",
  label: "Search",
  getNavigationItem: (context) => ({
    href: `${context.basePrefix}/search/`,
    label: "Search"
  }),
  async run(context) {
    const navigation = enabledNavigation(context);
    const searchIndex = context.siteData.articles.map((article) => ({
      excerpt: article.excerpt,
      path: article.path,
      tags: article.tags,
      title: article.title,
      urlPath: article.urlPath
    }));
    const searchScript = `const input = document.querySelector('[data-search-input]'); const results = document.querySelector('[data-search-results]'); let index = []; fetch('${context.basePrefix}/assets/search-index.json').then((response) => response.json()).then((payload) => { index = payload; }); input?.addEventListener('input', () => { const query = (input.value || '').trim().toLowerCase(); const matches = query ? index.filter((item) => item.title.toLowerCase().includes(query) || item.path.toLowerCase().includes(query) || item.tags.some((tag) => tag.toLowerCase().includes(query)) || item.excerpt.toLowerCase().includes(query)) : []; results.innerHTML = matches.map((item) => '<article class=\"post-card\"><h2><a href=\"' + item.urlPath + '\">' + item.title + '</a></h2><p>' + item.excerpt + '</p></article>').join('') || '<p>No matches.</p>'; });`;
    await context.writeTextAsset("assets/search-index.json", `${JSON.stringify(searchIndex, null, 2)}\n`);
    await context.writeTextAsset("assets/search.js", searchScript);

    const body = `<section class="hero-panel"><h1>Search</h1><p>Find articles by title, path, tag, or excerpt.</p></section>
      <section class="content-panel">
        <input class="search-input" data-search-input placeholder="Search articles">
        <div data-search-results><p>Type to search.</p></div>
      </section>
      <script src="${context.basePrefix}/assets/search.js"></script>`;

    await context.writeHtml(
      "search/index.html",
      context.theme.renderPage({
        basePath: context.basePrefix,
        content: body,
        description: "Search the knowledge base.",
        navigation,
        siteDescription: context.config.siteDescription,
        siteTitle: context.config.siteTitle,
        title: "Search"
      })
    );
  }
};

export const sitePlugins = [
  atlasThemePlugin,
  topOrderPlugin,
  homePlugin,
  articlePagesPlugin,
  tagsPlugin,
  treePlugin,
  aboutPlugin,
  searchPlugin
];

function enabledNavigation(context: Parameters<Exclude<SitePluginDefinition["getNavigationItem"], undefined>>[0]) {
  return sitePlugins
    .filter((plugin) => context.config.enabledPlugins.includes(plugin.id))
    .map((plugin) => plugin.getNavigationItem?.(context))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
