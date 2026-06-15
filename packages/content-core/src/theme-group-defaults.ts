import { highlightThemeCss } from "./highlight-theme.js";

export interface ThemeColorPalette {
  accent: string;
  accentAlt: string;
  background: string;
  foreground: string;
  line: string;
  muted: string;
  paper: string;
  shadow: string;
}

function buildColorVariables(colors: ThemeColorPalette) {
  return `:root {
  --bg: ${colors.background};
  --paper: ${colors.paper};
  --ink: ${colors.foreground};
  --muted: ${colors.muted};
  --accent: ${colors.accent};
  --accent-2: ${colors.accentAlt};
  --line: ${colors.line};
  --shadow: ${colors.shadow};
  --graph-line: color-mix(in srgb, var(--accent-2) 16%, transparent);
  --stroke: color-mix(in srgb, var(--ink) 72%, var(--accent) 28%);
  --site-background-image: none;
}`;
}

export function buildDefaultThemeChromeCss(colors: ThemeColorPalette) {
  return `/* config/theme/atlas/chrome.css */
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

${buildColorVariables(colors)}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
}

body {
  background:
    linear-gradient(180deg, rgba(255, 252, 246, 0.9), rgba(255, 252, 246, 0.96)),
    var(--site-background-image) center / cover no-repeat fixed,
    var(--bg);
  color: var(--ink);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  line-height: 1.78;
  position: relative;
}

a {
  color: inherit;
}

img {
  display: block;
  max-width: 100%;
}

::selection {
  background: color-mix(in srgb, var(--accent) 20%, white);
}

.paper-background {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: 0;
}

.paper-background__grain,
.paper-background__geometry {
  inset: 0;
  position: absolute;
}

.paper-background__grain {
  background:
    radial-gradient(circle at 10% 12%, rgba(0, 0, 0, 0.04) 0 1px, transparent 1px 100%),
    radial-gradient(circle at 72% 26%, rgba(0, 0, 0, 0.03) 0 1px, transparent 1px 100%),
    radial-gradient(circle at 24% 78%, rgba(0, 0, 0, 0.03) 0 1px, transparent 1px 100%);
  background-size: 18px 18px, 24px 24px, 30px 30px;
  opacity: 0.3;
}

.paper-background__geometry {
  background:
    linear-gradient(90deg, transparent 0 8%, rgba(194, 65, 12, 0.08) 8% 8.15%, transparent 8.15% 100%),
    repeating-linear-gradient(180deg, transparent 0 47px, rgba(15, 118, 110, 0.08) 47px 48px);
}

.site-shell {
  margin: 0 auto;
  max-width: 1100px;
  padding: 28px 24px 76px;
  position: relative;
  z-index: 1;
}

.site-header,
.site-footer {
  align-items: end;
  display: grid;
  gap: 16px 28px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 10px 0 16px;
  position: relative;
}

.site-header::after,
.site-footer::before {
  background:
    linear-gradient(90deg, rgba(31, 41, 55, 0.22), rgba(31, 41, 55, 0.12) 70%, transparent);
  bottom: 0;
  content: "";
  height: 1px;
  left: 0;
  position: absolute;
  right: 0;
}

.site-footer {
  align-items: center;
  grid-template-columns: 1fr;
  margin-top: 30px;
  padding-top: 20px;
}

.site-brand {
  align-items: end;
  display: inline-flex;
  gap: 14px;
  text-decoration: none;
}

.site-brand__mark,
.site-brand__text,
.hero-notebook h1,
.subhero-panel h1,
.feed-section__header h2,
.site-nav a,
.site-intro,
.tag-chip,
.pagination-page,
.pagination-link,
.entry-meta,
.article-hero__meta,
.hero-note {
  font-family: "Caveat", cursive;
}

.site-brand__mark {
  color: var(--accent);
  font-size: 2.1rem;
  line-height: 1;
  transform: rotate(-8deg);
}

.site-brand__text {
  font-size: clamp(2rem, 3vw, 2.8rem);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
}

.site-intro,
.site-footer p,
.feed-section__header p,
.content-section > p,
.subhero-panel p,
.post-entry p,
.entry-path {
  color: var(--muted);
}

.site-intro {
  grid-column: 1 / 2;
  margin: 0;
  max-width: 36rem;
}

.site-nav {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: flex-end;
}

.site-nav a,
.pagination-page,
.pagination-link {
  line-height: 1;
  position: relative;
  text-decoration: none;
}

.site-nav a {
  font-size: 1.4rem;
}

.site-nav a::after,
.pagination-page::after,
.pagination-link::after {
  background: color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: 999px;
  bottom: -0.18em;
  content: "";
  height: 2px;
  left: 0;
  position: absolute;
  transform: scaleX(0.18);
  transform-origin: left;
  transition: transform 180ms ease;
  width: 100%;
}

.site-nav a:hover::after,
.pagination-page:hover::after,
.pagination-link:hover::after {
  transform: scaleX(1);
}

.page-shell {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-top: 18px;
}

.hero-notebook,
.subhero-panel,
.article-hero {
  position: relative;
}

.hero-notebook::before,
.subhero-panel::before,
.article-hero::before {
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.hero-notebook {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: min(64svh, 540px);
  padding: 40px 0 20px;
}

.hero-notebook::before {
  background:
    radial-gradient(circle at 82% 20%, color-mix(in srgb, var(--accent) 18%, transparent) 0 84px, transparent 84px 100%),
    linear-gradient(115deg, transparent 0 56%, color-mix(in srgb, var(--accent-2) 16%, transparent) 56% 57%, transparent 57% 100%);
}

.hero-notebook__lead,
.hero-notebook__metrics,
.subhero-panel,
.article-hero {
  position: relative;
  z-index: 1;
}

.hero-notebook h1,
.subhero-panel h1,
.article-hero h1 {
  font-size: clamp(2.8rem, 7vw, 5.8rem);
  letter-spacing: 0.01em;
  line-height: 0.98;
  margin: 0;
  max-width: 11ch;
}

.hero-notebook p,
.subhero-panel p {
  font-size: 1.02rem;
  margin: 16px 0 0;
  max-width: 34rem;
}

.hero-notebook__metrics {
  align-self: end;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-self: end;
  text-align: right;
}

.hero-notebook__metrics span,
.hero-note {
  color: var(--accent);
  display: inline-block;
  font-size: 1.55rem;
  transform: rotate(-3deg);
}

.hero-notebook__metrics strong {
  font-family: "Fraunces", "Times New Roman", serif;
  font-size: 1.35em;
}

.subhero-panel,
.article-hero {
  padding: 14px 0 4px;
}

.feed-section,
.content-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.feed-section__header {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  justify-content: space-between;
}

.feed-section__header h2 {
  font-size: 1.8rem;
  margin: 0;
}

.post-list {
  display: grid;
  gap: 0;
}

.post-entry {
  padding: 22px 0 24px 24px;
  position: relative;
}

.post-entry + .post-entry {
  border-top: 1px dashed color-mix(in srgb, var(--stroke) 28%, transparent);
}

.entry-pencil-line {
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 62%, var(--stroke) 38%), transparent);
  border-radius: 999px;
  height: calc(100% - 18px);
  left: 6px;
  position: absolute;
  top: 9px;
  width: 2px;
}

.entry-meta,
.article-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 1.18rem;
  margin-bottom: 10px;
}

.entry-footer {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  justify-content: space-between;
  margin-top: 16px;
}

.entry-path {
  font-size: 0.84rem;
  margin: 0;
}

.tag-row,
.tag-sheet,
.pagination-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-chip {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--accent-2) 28%, transparent);
  border-radius: 999px;
  color: color-mix(in srgb, var(--accent-2) 78%, var(--ink) 22%);
  font-size: 1.16rem;
  padding: 0.42rem 0.82rem;
  text-decoration: none;
}

.pagination {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: space-between;
  margin-top: 12px;
}

.pagination-page {
  font-size: 1.5rem;
}

.pagination-page.is-active {
  color: var(--ink);
  font-weight: 700;
}

.pagination-link.is-disabled {
  opacity: 0.48;
  pointer-events: none;
}

.article-layout {
  display: grid;
  gap: 32px;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
}

.site-footer__identity {
  display: grid;
  gap: 4px;
}

.site-footer__brand {
  color: var(--accent);
  font-family: "Caveat", cursive;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
}

@keyframes page-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-notebook,
.subhero-panel,
.article-hero,
.post-entry {
  animation: page-rise 380ms ease both;
}

.post-entry:nth-child(2) { animation-delay: 40ms; }
.post-entry:nth-child(3) { animation-delay: 80ms; }
.post-entry:nth-child(4) { animation-delay: 120ms; }

@media (max-width: 960px) {
  .site-header,
  .hero-notebook,
  .article-layout {
    grid-template-columns: 1fr;
  }

  .site-nav {
    justify-content: flex-start;
  }

  .hero-notebook__metrics {
    justify-self: start;
    text-align: left;
  }
}

@media (max-width: 680px) {
  .site-shell {
    padding-inline: 16px;
  }

  .hero-notebook h1,
  .subhero-panel h1,
  .article-hero h1 {
    max-width: none;
  }

  .post-entry {
    padding-left: 20px;
  }

  .entry-pencil-line {
    left: 2px;
  }

  .pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
}

export function buildDefaultThemeProseCss(colors: ThemeColorPalette) {
  return `/* config/theme/atlas/prose.css */
${buildColorVariables(colors)}

.article-panel,
.side-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.55), transparent 22%), var(--paper);
  box-shadow: var(--shadow);
  position: relative;
}

.article-panel::before,
.side-panel::before {
  border: 1px solid color-mix(in srgb, var(--stroke) 20%, transparent);
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.article-panel {
  padding: 28px 30px;
}

.article-panel::before {
  border-radius: 28px 24px 26px 22px;
}

.side-panel {
  align-self: start;
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  padding: 20px 0 0 18px;
  position: sticky;
  top: 18px;
}

.side-panel::before {
  border-width: 0 0 0 1px;
}

.side-panel h3,
.prose h1,
.prose h2,
.prose h3 {
  font-family: "Fraunces", "Times New Roman", serif;
}

.side-panel h3 {
  font-size: 1rem;
  margin: 0 0 12px;
}

.side-panel ul,
.side-panel ul ul {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.side-panel ul ul {
  margin-left: 14px;
}

.side-panel a,
.side-panel li {
  color: var(--muted);
}

.side-panel a {
  position: relative;
  text-decoration: none;
}

.side-panel a::after {
  background: color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: 999px;
  bottom: -0.18em;
  content: "";
  height: 2px;
  left: 0;
  position: absolute;
  transform: scaleX(0.18);
  transform-origin: left;
  transition: transform 180ms ease;
  width: 100%;
}

.side-panel a:hover::after {
  transform: scaleX(1);
}

.prose {
  line-height: 1.82;
}

.prose > :first-child {
  margin-top: 0;
}

.prose > :last-child {
  margin-bottom: 0;
}

.prose h1,
.prose h2,
.prose h3 {
  line-height: 1.08;
  margin-top: 1.9em;
}

.prose p,
.prose li {
  color: color-mix(in srgb, var(--ink) 95%, black 5%);
}

.prose a {
  color: color-mix(in srgb, var(--accent) 66%, var(--ink) 34%);
}

.prose code:not(pre code) {
  background: color-mix(in srgb, var(--accent) 8%, white);
  border-radius: 8px;
  padding: 0.18em 0.38em;
}

.prose pre {
  background: #1d252c;
  border: 1px solid color-mix(in srgb, var(--accent-2) 16%, transparent);
  border-radius: 18px;
  color: #edf1f5;
  overflow: auto;
  padding: 18px;
}

.prose pre code,
.prose code:not(pre code) {
  font-family: "IBM Plex Mono", "Cascadia Code", monospace;
}

.prose img {
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
}

.prose blockquote {
  border-left: 3px solid color-mix(in srgb, var(--accent-2) 48%, transparent);
  margin: 0;
  padding: 4px 0 4px 18px;
}

.prose table {
  border-collapse: collapse;
  width: 100%;
}

.prose th,
.prose td {
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 18%, transparent);
  padding: 10px 12px;
  text-align: left;
}

.prose .cbox,
.prose .pbox,
.prose .bbox,
.prose .dbox {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.58));
  margin: 1.5rem 0;
  padding: 1rem 1.1rem;
  position: relative;
}

.prose .cbox::before,
.prose .pbox::before,
.prose .bbox::before,
.prose .dbox::before {
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
}

.prose .cbox::before {
  border-left: 3px solid color-mix(in srgb, var(--accent) 72%, var(--stroke) 28%);
  border-top: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
}

.prose .pbox::before {
  border-right: 3px solid color-mix(in srgb, var(--accent-2) 72%, var(--stroke) 28%);
  border-bottom: 1px solid color-mix(in srgb, var(--accent-2) 32%, transparent);
}

.prose .bbox::before,
.prose .dbox::before {
  border: 1px solid color-mix(in srgb, var(--stroke) 24%, transparent);
}

.prose .bbox::before {
  border-style: dashed;
}

.prose .dbox::before {
  border-left-width: 3px;
}

.pager-row {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 34px;
}

.pager-row a,
.pager-row__empty {
  border-top: 1px solid color-mix(in srgb, var(--stroke) 26%, transparent);
  min-height: 68px;
  padding-top: 12px;
}

.pager-row a {
  display: grid;
  gap: 4px;
  text-decoration: none;
}

.pager-row a span {
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
}

${highlightThemeCss}

@media (max-width: 960px) {
  .side-panel {
    position: static;
  }
}

@media (max-width: 680px) {
  .article-panel {
    padding: 22px 20px;
  }
}
`;
}
