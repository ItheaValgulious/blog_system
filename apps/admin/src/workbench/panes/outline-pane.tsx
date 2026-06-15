import type { MarkdownOutlineItem } from "../../markdown-outline";

import type { PaneComponentProps } from "../types";

function renderOutlineNode(
  item: MarkdownOutlineItem,
  activeItemId: string | null,
  revealLine: (lineNumber: number) => void
) {
  return (
    <div key={item.id}>
      <button
        className={`outline-item depth-${item.depth} ${activeItemId === item.id ? "is-active" : ""}`}
        onClick={() => {
          if (item.lineNumber) {
            revealLine(item.lineNumber);
          }
        }}
        type="button"
      >
        <span>{item.text}</span>
      </button>
      {item.children.length > 0 ? (
        <div className="outline-children">
          {item.children.map((child) => renderOutlineNode(child, activeItemId, revealLine))}
        </div>
      ) : null}
    </div>
  );
}

export function OutlinePane({
  activeDocument,
  api,
  outlineTree,
  activeOutlineItemId
}: PaneComponentProps) {
  if (!activeDocument || activeDocument.kind !== "article") {
    return (
      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <strong>Markdown Outline</strong>
          <div className="empty-state">Open a markdown article to inspect its headings.</div>
        </div>
      </div>
    );
  }

  const outline = outlineTree ?? [];
  const activeItemId = activeOutlineItemId ?? null;

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <strong>Markdown Outline</strong>
        <span className="body-muted">{activeDocument.articlePath}</span>
      </div>
      <div className="sidebar-section tree-section">
        {outline.length === 0 ? (
          <div className="empty-state">No headings found in this article.</div>
        ) : (
          <div className="outline-tree">
            {outline.map((item) => renderOutlineNode(item, activeItemId, api.revealLine))}
          </div>
        )}
      </div>
    </div>
  );
}
