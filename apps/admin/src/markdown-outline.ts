import { extractHeadings, parseArticleSource, type HeadingItem } from "@blog-system/content-core";

export interface MarkdownOutlineItem extends HeadingItem {
  lineNumber: number;
  children: MarkdownOutlineItem[];
}

function computeBodyLineOffset(rawContent: string) {
  const normalized = rawContent.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return 0;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return 0;
  }

  const bodyStartIndex = closingIndex + 5;
  const linesBeforeBody = normalized.slice(0, bodyStartIndex).split("\n").length - 1;
  const rawBodyWithLeadingNewlines = normalized.slice(bodyStartIndex);
  const leadingNewlineCount = rawBodyWithLeadingNewlines.match(/^\n+/)?.[0].length ?? 0;

  return linesBeforeBody + leadingNewlineCount;
}

function parseOutlineBody(articlePath: string, rawContent: string) {
  try {
    return parseArticleSource(articlePath, rawContent).body;
  } catch {
    const normalizedRawContent = rawContent.replace(/\r\n/g, "\n");
    const closingIndex = normalizedRawContent.startsWith("---\n")
      ? normalizedRawContent.indexOf("\n---\n", 4)
      : -1;

    if (closingIndex === -1) {
      return normalizedRawContent;
    }

    return normalizedRawContent.slice(closingIndex + 5).replace(/^\n+/, "");
  }
}

function buildMarkdownOutlineTree(headings: MarkdownOutlineItem[]) {
  const roots: MarkdownOutlineItem[] = [];
  const stack: MarkdownOutlineItem[] = [];

  for (const heading of headings) {
    const node: MarkdownOutlineItem = {
      ...heading,
      children: []
    };

    while (stack.length > 0 && stack.at(-1)!.depth >= node.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack.at(-1)!.children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

export function extractMarkdownOutline(articlePath: string, rawContent: string) {
  const body = parseOutlineBody(articlePath, rawContent);
  const bodyLineOffset = computeBodyLineOffset(rawContent);
  const headings = extractHeadings(body).map((heading, index) => ({
    ...heading,
    id: heading.id || `heading-${index + 1}`,
    lineNumber: Math.max(1, (heading.lineNumber ?? 1) + bodyLineOffset),
    children: []
  }));

  return buildMarkdownOutlineTree(headings);
}

export function flattenMarkdownOutline(items: MarkdownOutlineItem[]): MarkdownOutlineItem[] {
  return items.flatMap((item) => [item, ...flattenMarkdownOutline(item.children)]);
}

export function findActiveMarkdownOutlineItemId(items: MarkdownOutlineItem[], lineNumber: number | null) {
  if (!Number.isFinite(lineNumber)) {
    return null;
  }

  let activeId: string | null = null;
  for (const item of flattenMarkdownOutline(items)) {
    if (item.lineNumber <= Number(lineNumber)) {
      activeId = item.id;
      continue;
    }

    break;
  }

  return activeId;
}
