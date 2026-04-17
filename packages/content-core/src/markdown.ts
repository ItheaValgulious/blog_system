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

import type { MarkdownBlockConfig, MarkdownBlockRule } from "./markdown-block-config.js";
import { applyMarkdownBlockRules } from "./markdown-block-config.js";
import type { ArticleRenderResult, HeadingItem, MarkdownBlock } from "./types.js";

interface HtmlTagBoundary {
  kind: "opening" | "closing";
  tagName: string;
}

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

function classifyHtmlTagBoundary(value: unknown): HtmlTagBoundary | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("<") || trimmed.startsWith("<!--") || trimmed.startsWith("<!") || trimmed.startsWith("<?")) {
    return null;
  }

  const closingMatch = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>$/.exec(trimmed);
  if (closingMatch) {
    return {
      kind: "closing",
      tagName: closingMatch[1].toLowerCase()
    };
  }

  if (trimmed.startsWith("</")) {
    return null;
  }

  const tagNameMatch = /^<([A-Za-z][A-Za-z0-9:-]*)/.exec(trimmed);
  if (!tagNameMatch) {
    return null;
  }

  const tagName = tagNameMatch[1].toLowerCase();
  let quote: "\"" | "'" | null = null;

  for (let index = tagNameMatch[0].length; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (character === "<") {
      return null;
    }

    if (character === ">") {
      const beforeClose = trimmed.slice(0, index).trimEnd();
      const afterClose = trimmed.slice(index + 1).trim();

      if (afterClose.length > 0 || beforeClose.endsWith("/")) {
        return null;
      }

      return {
        kind: "opening",
        tagName
      };
    }
  }

  return null;
}

function createMarkdownBlock(
  markdown: string,
  startOffsetValue: unknown,
  endOffsetValue: unknown,
  startLineValue: unknown,
  endLineValue: unknown
): MarkdownBlock | null {
  if (!Number.isFinite(startOffsetValue) || !Number.isFinite(endOffsetValue)) {
    return null;
  }

  const startOffset = Math.max(0, Number(startOffsetValue));
  const endOffset = Math.max(startOffset, Number(endOffsetValue));
  if (endOffset <= startOffset) {
    return null;
  }

  const source = markdown.slice(startOffset, endOffset);
  if (!source.trim()) {
    return null;
  }

  return {
    startLine: Number.isFinite(startLineValue) ? Number(startLineValue) : 1,
    endLine: Number.isFinite(endLineValue) ? Number(endLineValue) : Number.isFinite(startLineValue) ? Number(startLineValue) : 1,
    startOffset,
    endOffset,
    source
  };
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
  options: {
    hydrateMathOnServer: boolean;
    includeHeadings?: boolean;
    markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null;
  }
): Promise<ArticleRenderResult> {
  const preparedMarkdown = applyMarkdownBlockRules(markdown, options.markdownBlockConfig);
  const headings = options.includeHeadings === false ? [] : extractHeadings(preparedMarkdown);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(options.hydrateMathOnServer ? () => undefined : remarkMathPlaceholders)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug);

  if (options.hydrateMathOnServer) {
    processor.use(rehypeKatex, { strict: "ignore" });
  }

  const processed = await processor
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(preparedMarkdown);

  return {
    html: String(processed),
    headings
  };
}

export async function renderMarkdownWithMathPlaceholders(
  markdown: string,
  markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null
): Promise<ArticleRenderResult> {
  return renderMarkdownInternal(markdown, {
    hydrateMathOnServer: false,
    includeHeadings: true,
    markdownBlockConfig
  });
}

export async function renderMarkdownWithKatex(
  markdown: string,
  markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null
): Promise<ArticleRenderResult> {
  return renderMarkdownInternal(markdown, {
    hydrateMathOnServer: true,
    includeHeadings: true,
    markdownBlockConfig
  });
}

export async function renderMarkdownFragmentWithKatex(
  markdown: string,
  markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null
): Promise<string> {
  const rendered = await renderMarkdownInternal(markdown, {
    hydrateMathOnServer: true,
    includeHeadings: false,
    markdownBlockConfig
  });

  return rendered.html;
}

export function extractMarkdownBlocks(
  markdown: string,
  markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null
): MarkdownBlock[] {
  const preparedMarkdown = applyMarkdownBlockRules(markdown, markdownBlockConfig);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(preparedMarkdown) as any;
  const children = Array.isArray(tree.children) ? tree.children : [];
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < children.length) {
    const child = children[index];
    const htmlBoundary = child?.type === "html" ? classifyHtmlTagBoundary(child.value) : null;

    if (htmlBoundary?.kind === "opening") {
      const tagStack = [htmlBoundary.tagName];
      let matchIndex = -1;

      for (let scanIndex = index + 1; scanIndex < children.length; scanIndex += 1) {
        const nextChild = children[scanIndex];
        const nextBoundary = nextChild?.type === "html" ? classifyHtmlTagBoundary(nextChild.value) : null;

        if (!nextBoundary) {
          continue;
        }

        if (nextBoundary.kind === "opening") {
          tagStack.push(nextBoundary.tagName);
          continue;
        }

        const expectedTagName = tagStack[tagStack.length - 1];
        if (nextBoundary.tagName !== expectedTagName) {
          matchIndex = -1;
          break;
        }

        tagStack.pop();
        if (tagStack.length === 0) {
          matchIndex = scanIndex;
          break;
        }
      }

      if (matchIndex !== -1) {
        const mergedBlock = createMarkdownBlock(
          preparedMarkdown,
          child?.position?.start?.offset,
          children[matchIndex]?.position?.end?.offset,
          child?.position?.start?.line,
          children[matchIndex]?.position?.end?.line
        );

        if (mergedBlock) {
          blocks.push(mergedBlock);
          index = matchIndex + 1;
          continue;
        }
      }
    }

    const block = createMarkdownBlock(
      preparedMarkdown,
      child?.position?.start?.offset,
      child?.position?.end?.offset,
      child?.position?.start?.line,
      child?.position?.end?.line
    );

    if (block) {
      blocks.push(block);
    }

    index += 1;
  }

  if (blocks.length === 0 && preparedMarkdown.trim().length > 0) {
    const lineCount = preparedMarkdown.split(/\r?\n/).length;
    blocks.push({
      startLine: 1,
      endLine: lineCount,
      startOffset: 0,
      endOffset: preparedMarkdown.length,
      source: preparedMarkdown
    });
  }

  return blocks;
}

export async function renderMarkdown(
  markdown: string,
  markdownBlockConfig?: MarkdownBlockConfig | MarkdownBlockRule[] | null
): Promise<ArticleRenderResult> {
  return renderMarkdownWithMathPlaceholders(markdown, markdownBlockConfig);
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

export function rewriteManagedMediaTextReferences(content: string, mediaBasePath: string) {
  const normalizedBase = normalizeBasePath(mediaBasePath);
  return content.replace(/@media\/([A-Za-z0-9._/-]+)/g, (_match, assetPath: string) =>
    `${normalizedBase}/${assetPath}`.replace(/\/{2,}/g, "/")
  );
}
