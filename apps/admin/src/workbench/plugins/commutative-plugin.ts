import {
  COMMUTATIVE_FENCE_LANGUAGE,
  createEmptyCommutativeDocument,
  decodeCommutativeBase64,
  encodeCommutativeBase64,
  parseCommutative,
  renderCommutativeStaticHtml,
  serializeCommutative,
  commutativeCssText
} from "@blog-system/commutative";

import type * as monacoEditor from "monaco-editor";
import type { PluginDefinition, WorkbenchDocument } from "../types";

const INSERT_COMMAND_ID = "commutative.insertBlock";
const MODAL_ID = "commutative-modal-root";
const STYLE_ID = "commutative-admin-style";
const WIDGET_MIN_HEIGHT = 120;

interface MeasuredViewZone extends monacoEditor.editor.IViewZone {
  heightInPx: number;
}

interface CommutativeFenceBlock {
  content: string;
  endLineNumber: number;
  range: monacoEditor.IRange;
  startLineNumber: number;
}

interface CommutativeZoneRecord {
  block: CommutativeFenceBlock;
  domNode: HTMLDivElement;
  height: number;
  measure: () => void;
  dispose: () => void;
  viewZone: MeasuredViewZone;
  zoneId: string;
}

let activeMarkdownEditor: monacoEditor.editor.IStandaloneCodeEditor | null = null;
let activeMonacoApi: typeof monacoEditor | null = null;

function ensureAdminStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
${commutativeCssText}

.commutative-editor-zone {
  position: relative;
  padding: 10px 0 14px;
  pointer-events: auto;
  z-index: 20;
}

.commutative-editor-card {
  margin: 0 10px;
  border: 1px solid var(--wb-border);
  border-radius: 16px;
  background: var(--wb-bg-elevated);
  box-shadow: 0 12px 30px rgba(10, 16, 24, 0.18);
  overflow: hidden;
  cursor: pointer;
  color: var(--wb-foreground);
}

.commutative-editor-zone .commutative .cg-svg {
  max-width: none;
  height: auto;
}

.commutative-editor-card__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--wb-border);
  background: var(--wb-bg-panel);
}

.commutative-editor-card__title {
  font: 600 12px/1.2 "Cascadia Code", "Fira Code", monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wb-foreground);
}

.commutative-editor-card__hint {
  font: 500 12px/1.2 "Georgia", serif;
  color: var(--wb-foreground-muted);
}

.commutative-editor-card__body {
  padding: 8px 14px 14px;
  background: var(--wb-bg-elevated);
}

.commutative-editor-card__error {
  margin: 0 16px 14px 54px;
  border: 1px solid #c44536;
  border-radius: 16px;
  background: var(--wb-bg-panel);
  color: #c44536;
  padding: 16px 18px;
}

.commutative-editor-card__error strong {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
}

.commutative-editor-card__error code {
  display: block;
  white-space: pre-wrap;
  font-size: 12px;
}

.commutative-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 14, 20, 0.44);
  backdrop-filter: blur(6px);
}

.commutative-modal__card {
  width: min(1280px, calc(100vw - 48px));
  height: min(860px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--wb-border);
  background: var(--wb-bg-elevated);
  box-shadow: 0 28px 80px rgba(5, 10, 18, 0.28);
  color: var(--wb-foreground);
}

.commutative-modal__header,
.commutative-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--wb-border);
  background: var(--wb-bg-panel);
}

.commutative-modal__footer {
  border-top: 1px solid var(--wb-border);
  border-bottom: none;
}

.commutative-modal__title {
  font: 600 16px/1.2 "Georgia", serif;
  color: var(--wb-foreground);
}

.commutative-modal__actions {
  display: flex;
  gap: 10px;
}

.commutative-modal__button {
  border: 1px solid var(--wb-border);
  border-radius: 999px;
  padding: 9px 14px;
  background: var(--wb-bg-elevated);
  color: var(--wb-foreground);
  font: 600 13px/1 "Cascadia Code", "Fira Code", monospace;
  cursor: pointer;
}

.commutative-modal__button.primary {
  background: var(--wb-bg-active);
  color: var(--wb-foreground);
  border-color: var(--wb-bg-active);
}

.commutative-modal__iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--wb-bg);
}

.commutative-modal__status {
  font: 500 12px/1.3 "Georgia", serif;
  color: var(--wb-foreground-muted);
}
`;
  document.head.appendChild(style);
}

function isMarkdownDocument(document: WorkbenchDocument | null) {
  return Boolean(
    document &&
      (document.kind === "article" ||
        document.kind === "project" ||
        document.kind === "projectTask" ||
        document.kind === "projectLog")
  );
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildCommutativeFence(content: string) {
  return `\`\`\`${COMMUTATIVE_FENCE_LANGUAGE}\n${content.replace(/\s+$/, "")}\n\`\`\`\n`;
}

function findCommutativeBlocks(model: monacoEditor.editor.ITextModel): CommutativeFenceBlock[] {
  const matches = model.findMatches(
    "^```commutative[^\\n]*\\n([\\s\\S]*?)\\n```[ \\t]*$",
    true,
    true,
    true,
    null,
    true
  );

  return matches.map((match) => {
    const fullText = model.getValueInRange(match.range);
    const firstLineBreak = fullText.indexOf("\n");
    const lastFenceIndex = fullText.lastIndexOf("\n```");
    const content =
      firstLineBreak >= 0 && lastFenceIndex > firstLineBreak
        ? fullText.slice(firstLineBreak + 1, lastFenceIndex)
        : "";

    return {
      content,
      endLineNumber: match.range.endLineNumber,
      range: match.range,
      startLineNumber: match.range.startLineNumber
    };
  });
}

function layoutWidgetHeightFromHtml(html: string, fallbackHeight: number) {
  const heightMatch =
    /\bheight="(\d+(?:\.\d+)?)"/i.exec(html) ??
    /viewBox="0 0 [^"]+ (\d+(?:\.\d+)?)"/.exec(html);
  const parsedHeight = heightMatch ? Number(heightMatch[1]) : NaN;
  // Seed the zone with a reasonable estimate before we can measure the real DOM.
  return Math.max(WIDGET_MIN_HEIGHT, Number.isFinite(parsedHeight) ? parsedHeight + 64 : fallbackHeight);
}

function measureZoneHeight(zoneNode: HTMLDivElement) {
  const card = zoneNode.firstElementChild;
  if (!(card instanceof HTMLElement)) {
    return WIDGET_MIN_HEIGHT;
  }

  const zoneStyle = window.getComputedStyle(zoneNode);
  const paddingTop = Number.parseFloat(zoneStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(zoneStyle.paddingBottom) || 0;

  return Math.max(
    WIDGET_MIN_HEIGHT,
    Math.ceil(card.getBoundingClientRect().height + paddingTop + paddingBottom)
  );
}

function createZoneMeasurer(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  zoneNode: HTMLDivElement,
  viewZone: MeasuredViewZone
) {
  let zoneId = "";
  let frame = 0;
  let lastHeight = viewZone.heightInPx;
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          scheduleMeasure();
        })
      : null;

  const applyMeasuredHeight = () => {
    frame = 0;
    const nextHeight = measureZoneHeight(zoneNode);
    if (nextHeight === lastHeight) {
      return;
    }

    lastHeight = nextHeight;
    viewZone.heightInPx = nextHeight;
    if (zoneId) {
      editor.changeViewZones((accessor) => {
        accessor.layoutZone(zoneId);
      });
    }
  };

  const scheduleMeasure = () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
    frame = window.requestAnimationFrame(applyMeasuredHeight);
  };

  const observedCard = zoneNode.firstElementChild;
  if (observer && observedCard instanceof HTMLElement) {
    observer.observe(observedCard);
  }

  return {
    measure: scheduleMeasure,
    setZoneId(nextZoneId: string) {
      zoneId = nextZoneId;
    },
    dispose() {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
    }
  };
}

function readCurrentQuiverDocument(iframe: HTMLIFrameElement) {
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    throw new Error("Commutative editor is not ready yet.");
  }

  const currentUrl = new URL(iframeWindow.location.href);
  const hash = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
  // Use manual parsing instead of URLSearchParams, because URLSearchParams decodes
  // "+" as space, which corrupts base64 data produced by Quiver's own parser.
  const encoded = hash.split("&").reduce<string | null>((found, segment) => {
    if (found !== null) return found;
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) return null;
    return segment.slice(0, eqIndex) === "q" ? segment.slice(eqIndex + 1) : null;
  }, null);

  if (!encoded) {
    throw new Error("No graph payload found in Quiver URL.");
  }

  return decodeCommutativeBase64(encoded);
}

function openCommutativeModal(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor,
  block: CommutativeFenceBlock
) {
  ensureAdminStyles();

  const existing = document.getElementById(MODAL_ID);
  existing?.remove();

  const root = document.createElement("div");
  root.id = MODAL_ID;
  root.className = "commutative-modal";

  let startingDocument;
  try {
    startingDocument = parseCommutative(block.content);
  } catch {
    startingDocument = createEmptyCommutativeDocument();
  }

  const encoded = encodeCommutativeBase64(startingDocument);
  const iframe = document.createElement("iframe");
  iframe.className = "commutative-modal__iframe";
  iframe.src = `/quiver/index.html#q=${escapeAttribute(encoded)}`;
  iframe.addEventListener("load", () => {
    try {
      const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!iframeDoc) return;
      const globalPanel = iframeDoc.querySelector(".global");
      if (globalPanel) (globalPanel as HTMLElement).style.display = "none";
    } catch {
      // cross-origin access denied — ignore
    }
  });

  const close = () => {
    root.remove();
  };

  const apply = () => {
    const nextDocument = readCurrentQuiverDocument(iframe);
    const nextFence = buildCommutativeFence(serializeCommutative(nextDocument).trimEnd());
    editor.executeEdits("commutative-modal", [
      {
        range: block.range,
        text: nextFence
      }
    ]);
    close();
    editor.focus();
  };

  root.innerHTML = `
    <div class="commutative-modal__card" role="dialog" aria-modal="true" aria-label="Edit commutative diagram">
      <div class="commutative-modal__header">
        <div>
          <div class="commutative-modal__title">Commutative Editor</div>
          <div class="commutative-modal__status">Use Quiver's Save action first, then Apply here to write JSON back into Markdown.</div>
        </div>
        <div class="commutative-modal__actions">
          <button class="commutative-modal__button" data-action="cancel" type="button">Cancel</button>
        </div>
      </div>
      <div></div>
      <div class="commutative-modal__footer">
        <div class="commutative-modal__status">Stored format: raw JSON inside \`\`\`commutative fences.</div>
        <div class="commutative-modal__actions">
          <button class="commutative-modal__button" data-action="cancel-footer" type="button">Close</button>
          <button class="commutative-modal__button primary" data-action="apply" type="button">Apply</button>
        </div>
      </div>
    </div>
  `;

  const bodySlot = root.querySelector(".commutative-modal__card > div:nth-child(2)");
  bodySlot?.appendChild(iframe);

  root.addEventListener("click", (event) => {
    if (event.target === root) {
      close();
    }
  });
  root.querySelector('[data-action="cancel"]')?.addEventListener("click", close);
  root.querySelector('[data-action="cancel-footer"]')?.addEventListener("click", close);
  root.querySelector('[data-action="apply"]')?.addEventListener("click", () => {
    try {
      apply();
    } catch (error) {
      window.alert((error as Error).message);
    }
  });

  document.body.appendChild(root);
}

function renderBlockZone(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor,
  block: CommutativeFenceBlock
) {
  ensureAdminStyles();
  const zoneNode = document.createElement("div");
  zoneNode.className = "commutative-editor-zone";

  try {
    const rendered = renderCommutativeStaticHtml(parseCommutative(block.content), {
      className: "commutative--editor"
    });
    const initialHeight = layoutWidgetHeightFromHtml(rendered.html, WIDGET_MIN_HEIGHT);
    zoneNode.innerHTML = `
      <div class="commutative-editor-card" data-commutative-open="true">
        <div class="commutative-editor-card__toolbar">
          <span class="commutative-editor-card__title">Commutative</span>
          <span class="commutative-editor-card__hint">Click to edit in Quiver</span>
        </div>
        <div class="commutative-editor-card__body">${rendered.html}</div>
      </div>
    `;
    zoneNode.querySelector('[data-commutative-open="true"]')?.addEventListener("click", () => {
      openCommutativeModal(editor, monaco, block);
    });
    const viewZone: MeasuredViewZone = {
      afterLineNumber: block.startLineNumber - 1,
      domNode: zoneNode,
      heightInPx: initialHeight,
      showInHiddenAreas: true,
      suppressMouseDown: true
    };
    const measurer = createZoneMeasurer(editor, zoneNode, viewZone);
    return {
      domNode: zoneNode,
      dispose: measurer.dispose,
      height: initialHeight,
      measure: measurer.measure,
      setZoneId: measurer.setZoneId,
      viewZone
    };
  } catch (error) {
    zoneNode.innerHTML = `
      <div class="commutative-editor-card__error" data-commutative-open="true">
        <strong>Invalid commutative JSON</strong>
        <code>${String((error as Error).message ?? error)}</code>
      </div>
    `;
    zoneNode.querySelector('[data-commutative-open="true"]')?.addEventListener("click", () => {
      openCommutativeModal(editor, monaco, block);
    });
    const viewZone: MeasuredViewZone = {
      afterLineNumber: block.startLineNumber - 1,
      domNode: zoneNode,
      heightInPx: WIDGET_MIN_HEIGHT,
      showInHiddenAreas: true,
      suppressMouseDown: true
    };
    const measurer = createZoneMeasurer(editor, zoneNode, viewZone);
    return {
      domNode: zoneNode,
      dispose: measurer.dispose,
      height: WIDGET_MIN_HEIGHT,
      measure: measurer.measure,
      setZoneId: measurer.setZoneId,
      viewZone
    };
  }
}

function setEditorHiddenAreas(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  ranges: monacoEditor.IRange[]
) {
  const e = editor as Record<string, unknown>;
  try {
    if (typeof e.setHiddenAreas === "function") {
      e.setHiddenAreas(ranges);
    } else if (typeof e._setHiddenAreas === "function") {
      e._setHiddenAreas(ranges);
    }
  } catch {
    // Monaco internal API may not be available — zones still provide visual replacement
  }
}

function applyCommutativeZones(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor,
  previousZones: CommutativeZoneRecord[]
) {
  const model = editor.getModel();
  if (!model) {
    return [];
  }

  const blocks = findCommutativeBlocks(model);
  const hiddenAreas = blocks.map(
    (block) =>
      new monaco.Range(
        block.startLineNumber,
        1,
        block.endLineNumber,
        model.getLineMaxColumn(block.endLineNumber)
      )
  );

  editor.changeViewZones((accessor) => {
    for (const zone of previousZones) {
      zone.dispose();
      accessor.removeZone(zone.zoneId);
    }
  });

  const nextZones: CommutativeZoneRecord[] = [];
  editor.changeViewZones((accessor) => {
    for (const block of blocks) {
      const rendered = renderBlockZone(editor, monaco, block);
      const zoneId = accessor.addZone(rendered.viewZone);
      rendered.setZoneId(zoneId);
      nextZones.push({
        block,
        domNode: rendered.domNode,
        dispose: rendered.dispose,
        height: rendered.height,
        measure: rendered.measure,
        viewZone: rendered.viewZone,
        zoneId
      });
    }
  });

  for (const zone of nextZones) {
    zone.measure();
  }

  setEditorHiddenAreas(editor, hiddenAreas);

  return nextZones;
}

function syncHiddenAreasForCurrentBlocks(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor
) {
  const model = editor.getModel();
  if (!model) {
    return;
  }

  const hiddenAreas = findCommutativeBlocks(model).map(
    (block) =>
      new monaco.Range(
        block.startLineNumber,
        1,
        block.endLineNumber,
        model.getLineMaxColumn(block.endLineNumber)
      )
  );
  setEditorHiddenAreas(editor, hiddenAreas);
}

function findVisibleZoneAtPoint(
  zones: CommutativeZoneRecord[],
  clientX: number,
  clientY: number
) {
  for (const zone of zones) {
    const bounds = zone.domNode.getBoundingClientRect();
    if (
      bounds.width > 0 &&
      bounds.height > 0 &&
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    ) {
      return zone;
    }
  }

  return null;
}

function insertCommutativeBlockAtSelection(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor
) {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return false;
  }

  const serialized = serializeCommutative(createEmptyCommutativeDocument()).trimEnd();
  const snippet = buildCommutativeFence(serialized);
  const containingBlock = findCommutativeBlocks(model).find(
    (block) =>
      selection.startLineNumber >= block.startLineNumber &&
      selection.startLineNumber <= block.endLineNumber
  );
  const insertionRange = containingBlock
    ? containingBlock.endLineNumber < model.getLineCount()
      ? new monaco.Range(
          containingBlock.endLineNumber + 1,
          1,
          containingBlock.endLineNumber + 1,
          1
        )
      : new monaco.Range(
          model.getLineCount(),
          model.getLineMaxColumn(model.getLineCount()),
          model.getLineCount(),
          model.getLineMaxColumn(model.getLineCount())
        )
    : selection;
  const insertionText =
    containingBlock && containingBlock.endLineNumber >= model.getLineCount() ? `\n${snippet}` : snippet;

  editor.executeEdits("commutative-insert", [
    {
      range: insertionRange,
      text: insertionText
    }
  ]);

  const insertedLine = containingBlock ? containingBlock.endLineNumber + 1 : selection.startLineNumber;
  editor.setPosition({
    lineNumber: insertedLine + 1,
    column: 1
  });
  editor.focus();
  return true;
}

export const commutativePlugin: PluginDefinition = {
  id: "commutative",
  label: "Commutative",
  description: "Adds commutative diagram widgets, preview rendering, and Quiver-based editing for fenced commutative blocks.",
  activate(context) {
    context.registerMarkdownFenceRenderer({
      language: COMMUTATIVE_FENCE_LANGUAGE,
      name: "commutative",
      render(renderContext) {
        const document = parseCommutative(renderContext.content);
        return {
          cssText: commutativeCssText,
          html: renderCommutativeStaticHtml(document).html
        };
      }
    });

    context.registerCommand({
      id: INSERT_COMMAND_ID,
      title: "Insert: Commutative",
      keywords: ["diagram", "quiver", "commutative", "graph", "markdown"],
      handler() {
        const editor = activeMarkdownEditor;
        const monaco = activeMonacoApi;
        if (!editor || !monaco) {
          return;
        }
        insertCommutativeBlockAtSelection(editor, monaco);
      }
    });

    context.registerMarkdownEditorFeature({
      id: "commutative-markdown-widget",
      matches(document) {
        return isMarkdownDocument(document);
      },
      onMount(editor, monaco, document) {
        if (!isMarkdownDocument(document)) {
          return;
        }

        activeMarkdownEditor = editor;
        activeMonacoApi = monaco;
        let zones: CommutativeZoneRecord[] = [];
        let hiddenAreaSyncFrame = 0;
        const scheduleHiddenAreaSync = () => {
          if (hiddenAreaSyncFrame) {
            window.cancelAnimationFrame(hiddenAreaSyncFrame);
          }
          hiddenAreaSyncFrame = window.requestAnimationFrame(() => {
            hiddenAreaSyncFrame = 0;
            syncHiddenAreasForCurrentBlocks(editor, monaco);
          });
        };
        const refresh = () => {
          zones = applyCommutativeZones(editor, monaco, zones);
          // Monaco can clear hidden areas after content resets such as save-time
          // normalization, so re-apply on the next frame as well.
          scheduleHiddenAreaSync();
        };
        const editorDomNode = editor.getDomNode();
        const pointerDownListener = (event: MouseEvent) => {
          const matchingZone = findVisibleZoneAtPoint(zones, event.clientX, event.clientY);
          if (!matchingZone) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          openCommutativeModal(editor, monaco, matchingZone.block);
        };

        refresh();
        const contentDisposable = editor.onDidChangeModelContent(() => {
          refresh();
        });
        const modelDisposable = editor.onDidChangeModel(() => {
          zones = [];
          refresh();
        });
        editorDomNode?.addEventListener("mousedown", pointerDownListener, true);

        return () => {
          if (activeMarkdownEditor === editor) {
            activeMarkdownEditor = null;
          }
          if (activeMonacoApi === monaco) {
            activeMonacoApi = null;
          }
          if (hiddenAreaSyncFrame) {
            window.cancelAnimationFrame(hiddenAreaSyncFrame);
          }
          editorDomNode?.removeEventListener("mousedown", pointerDownListener, true);
          contentDisposable.dispose();
          modelDisposable.dispose();
          editor.changeViewZones((accessor) => {
            for (const zone of zones) {
              zone.dispose();
              accessor.removeZone(zone.zoneId);
            }
          });
          setEditorHiddenAreas(editor, []);
        };
      }
    });
  }
};
