import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { ArticleRenderResult, HeadingItem, MarkdownBlock } from "./types.js";

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

function remarkMathPlaceholders() {
  return (tree: any) => {
    visit(tree, ["inlineMath", "math"], (node: any, index?: number, parent?: any) => {
      if (!parent || index === undefined) {
        return;
      }

      const tex = typeof node.value === "string" ? node.value : "";
      const escapedTex = escapeHtmlAttribute(tex);
      parent.children[index] = {
        type: "html",
        value:
          node.type === "inlineMath"
            ? `<span class="math-placeholder inline" data-tex="${escapedTex}"></span>`
            : `<div class="math-placeholder block" data-tex="${escapedTex}"></div>`
      };
    });
  };
}

function isExternalResource(url: string): boolean {
  return /^(?:@media\/|[a-z]+:|#|\/)/i.test(url);
}

function normalizeBasePath(basePath: string) {
  return basePath.replace(/\/+$/g, "");
}

export function extractHeadings(markdown: string): HeadingItem[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
  const slugger = new GithubSlugger();
  const headings: HeadingItem[] = [];

  visit(tree, "heading", (node: any) => {
    const text = toString(node).trim();

    if (!text) {
      return;
    }

    headings.push({
      depth: node.depth,
      text,
      id: slugger.slug(text)
    });
  });

  return headings;
}

async function renderMarkdownInternal(
  markdown: string,
  options: { hydrateMathOnServer: boolean; includeHeadings?: boolean }
): Promise<ArticleRenderResult> {
  const headings = options.includeHeadings === false ? [] : extractHeadings(markdown);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(options.hydrateMathOnServer ? () => undefined : remarkMathPlaceholders)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug);

  if (options.hydrateMathOnServer) {
    processor.use(rehypeKatex);
  }

  const processed = await processor
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return {
    html: String(processed),
    headings
  };
}

export async function renderMarkdownWithMathPlaceholders(
  markdown: string
): Promise<ArticleRenderResult> {
  return renderMarkdownInternal(markdown, { hydrateMathOnServer: false, includeHeadings: true });
}

export async function renderMarkdownWithKatex(markdown: string): Promise<ArticleRenderResult> {
  return renderMarkdownInternal(markdown, { hydrateMathOnServer: true, includeHeadings: true });
}

export async function renderMarkdownFragmentWithKatex(markdown: string): Promise<string> {
  const rendered = await renderMarkdownInternal(markdown, {
    hydrateMathOnServer: true,
    includeHeadings: false
  });

  return rendered.html;
}

export function extractMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown) as any;
  const children = Array.isArray(tree.children) ? tree.children : [];
  const blocks: MarkdownBlock[] = [];

  for (const child of children) {
    const startOffset = child?.position?.start?.offset;
    const endOffset = child?.position?.end?.offset;
    const startLine = child?.position?.start?.line;
    const endLine = child?.position?.end?.line;

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      continue;
    }

    const safeStart = Math.max(0, Number(startOffset));
    const safeEnd = Math.max(safeStart, Number(endOffset));
    if (safeEnd <= safeStart) {
      continue;
    }

    const source = markdown.slice(safeStart, safeEnd);
    if (!source.trim()) {
      continue;
    }

    blocks.push({
      startLine: Number.isFinite(startLine) ? Number(startLine) : 1,
      endLine: Number.isFinite(endLine) ? Number(endLine) : Number.isFinite(startLine) ? Number(startLine) : 1,
      startOffset: safeStart,
      endOffset: safeEnd,
      source
    });
  }

  if (blocks.length === 0 && markdown.trim().length > 0) {
    const lineCount = markdown.split(/\r?\n/).length;
    blocks.push({
      startLine: 1,
      endLine: lineCount,
      startOffset: 0,
      endOffset: markdown.length,
      source: markdown
    });
  }

  return blocks;
}

export async function renderMarkdown(markdown: string): Promise<ArticleRenderResult> {
  return renderMarkdownWithMathPlaceholders(markdown);
}

export function rewriteRelativeAssetUrls(
  html: string,
  articleDirectory: string,
  assetBasePath: string
): string {
  const normalizedDir = articleDirectory.replace(/^\/+|\/+$/g, "");
  const normalizedBase = assetBasePath.replace(/\/+$/g, "");

  return html.replace(
    /(src|href)=("([^"]+)"|'([^']+)')/g,
    (match, attribute, quotedValue, doubleQuoted, singleQuoted) => {
      const original = doubleQuoted ?? singleQuoted ?? "";

      if (!original || isExternalResource(original)) {
        return match;
      }

      const rewritten = `${normalizedBase}/${normalizedDir ? `${normalizedDir}/` : ""}${original}`
        .replace(/\/{2,}/g, "/")
        .replace(":/", "://");
      const quote = quotedValue.startsWith("'") ? "'" : "\"";
      return `${attribute}=${quote}${rewritten}${quote}`;
    }
  );
}

export function rewriteManagedMediaUrls(html: string, mediaBasePath: string) {
  const normalizedBase = normalizeBasePath(mediaBasePath);

  return html.replace(
    /(src|href)=("([^"]+)"|'([^']+)')/g,
    (match, attribute, quotedValue, doubleQuoted, singleQuoted) => {
      const original = doubleQuoted ?? singleQuoted ?? "";

      if (!original.startsWith("@media/")) {
        return match;
      }

      const rewritten = `${normalizedBase}/${original.slice("@media/".length)}`.replace(/\/{2,}/g, "/");
      const quote = quotedValue.startsWith("'") ? "'" : "\"";
      return `${attribute}=${quote}${rewritten}${quote}`;
    }
  );
}

export function resolveManagedMediaPath(value: string, mediaBasePath: string) {
  if (!value.startsWith("@media/")) {
    return value;
  }

  return `${normalizeBasePath(mediaBasePath)}/${value.slice("@media/".length)}`.replace(/\/{2,}/g, "/");
}
