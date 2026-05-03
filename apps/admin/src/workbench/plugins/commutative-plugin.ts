import {
  COMMUTATIVE_FENCE_LANGUAGE,
  createEmptyCommutativeDocument,
  decodeCommutativeBase64,
  encodeCommutativeBase64,
  parseCommutative,
  renderCommutativeStaticHtml,
  commutativeCssText
} from "@blog-system/commutative";

import type * as monacoEditor from "monaco-editor";
import type { PluginDefinition, WorkbenchDocument } from "../types";

const INSERT_COMMAND_ID = "commutative.insertBlock";
const EDIT_CURRENT_COMMAND_ID = "commutative.editCurrentBlock";
const MODAL_ID = "commutative-modal-root";
const STYLE_ID = "commutative-admin-style";

interface CommutativeFenceBlock {
  content: string;
  endLineNumber: number;
  range: monacoEditor.IRange;
  startLineNumber: number;
}

let activeMarkdownEditor: monacoEditor.editor.IStandaloneCodeEditor | null = null;
let activeMonacoApi: typeof monacoEditor | null = null;

function getBlockKey(block: CommutativeFenceBlock) {
  return `${block.startLineNumber}:${block.endLineNumber}:${block.content}`;
}

function getBlockSignature(blocks: CommutativeFenceBlock[]) {
  return blocks.map(getBlockKey).join("\n---commutative-block---\n");
}

function contentChangeMayAffectCommutativeBlocks(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  event: monacoEditor.editor.IModelContentChangedEvent
) {
  const model = editor.getModel();
  if (!model) {
    return true;
  }

  return event.changes.some((change) => {
    const insertedText = change.text;
    if (insertedText.includes("```") || insertedText.includes(COMMUTATIVE_FENCE_LANGUAGE)) {
      return true;
    }

    const startLine = Math.max(1, change.range.startLineNumber - 1);
    const endLine = Math.min(model.getLineCount(), change.range.endLineNumber + 1);
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = model.getLineContent(lineNumber);
      if (line.includes("```") || line.includes(COMMUTATIVE_FENCE_LANGUAGE)) {
        return true;
      }
    }

    return false;
  });
}

function ensureAdminStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
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

function buildCommutativeFence(document: ReturnType<typeof parseCommutative>) {
  const encoded = encodeCommutativeBase64(document);
  return `\`\`\`${COMMUTATIVE_FENCE_LANGUAGE}\n${encoded}\n\`\`\`\n`;
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

function findBlockAtSelection(editor: monacoEditor.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return null;
  }

  return (
    findCommutativeBlocks(model).find(
      (block) =>
        selection.startLineNumber >= block.startLineNumber &&
        selection.startLineNumber <= block.endLineNumber
    ) ?? null
  );
}

function foldCommutativeBlocks(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  blocks: CommutativeFenceBlock[]
) {
  if (blocks.length === 0) {
    return;
  }

  const action = editor.getAction("editor.fold");
  if (!action) {
    return;
  }

  void action.run({
    selectionLines: blocks.map((block) => block.startLineNumber)
  }).catch(() => undefined);
}

function readCurrentQuiverDocument(iframe: HTMLIFrameElement) {
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    throw new Error("Commutative editor is not ready yet.");
  }

  const currentUrl = new URL(iframeWindow.location.href);
  const hash = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
  const encoded = hash.split("&").reduce<string | null>((found, segment) => {
    if (found !== null) return found;
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) return null;
    return segment.slice(0, eqIndex) === "q" ? segment.slice(eqIndex + 1) : null;
  }, null);

  if (!encoded) {
    throw new Error("No graph payload found in Quiver URL.");
  }

  return decodeCommutativeBase64(decodeURIComponent(encoded));
}

function openCommutativeModal(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
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
  iframe.src = `/quiver/index.html#q=${encodeURIComponent(encoded)}`;
  iframe.addEventListener("load", () => {
    try {
      const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!iframeDoc) return;
      const globalPanel = iframeDoc.querySelector(".global");
      if (globalPanel) (globalPanel as HTMLElement).style.display = "none";
    } catch {
      // Ignore cross-origin access failures.
    }
  });

  const close = () => {
    root.remove();
  };

  const apply = () => {
    const nextDocument = readCurrentQuiverDocument(iframe);
    const nextFence = buildCommutativeFence(nextDocument);
    editor.executeEdits("commutative-modal", [
      {
        range: block.range,
        text: nextFence
      }
    ]);
    close();
    editor.focus();
    window.setTimeout(() => {
      const model = editor.getModel();
      if (model) {
        foldCommutativeBlocks(editor, findCommutativeBlocks(model));
      }
    }, 120);
  };

  root.innerHTML = `
    <div class="commutative-modal__card" role="dialog" aria-modal="true" aria-label="Edit commutative diagram">
      <div class="commutative-modal__header">
        <div>
          <div class="commutative-modal__title">Commutative Editor</div>
          <div class="commutative-modal__status">Use Quiver's Save action first, then Apply here to write base64 back into Markdown.</div>
        </div>
        <div class="commutative-modal__actions">
          <button class="commutative-modal__button" data-action="cancel" type="button">Cancel</button>
        </div>
      </div>
      <div></div>
      <div class="commutative-modal__footer">
        <div class="commutative-modal__status">Stored format: base64 inside \`\`\`commutative fences.</div>
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

function insertCommutativeBlockAtSelection(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  monaco: typeof monacoEditor
) {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) {
    return false;
  }

  const snippet = buildCommutativeFence(createEmptyCommutativeDocument());
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

  window.setTimeout(() => {
    const nextModel = editor.getModel();
    if (!nextModel) {
      return;
    }

    const blocks = findCommutativeBlocks(nextModel);
    const insertedBlock =
      blocks.find((block) => block.startLineNumber === insertedLine) ??
      blocks.find(
        (block) => insertedLine >= block.startLineNumber && insertedLine <= block.endLineNumber
      );
    foldCommutativeBlocks(editor, blocks);
    if (insertedBlock) {
      openCommutativeModal(editor, insertedBlock);
    }
  }, 120);
  return true;
}

function editCurrentCommutativeBlock(editor: monacoEditor.editor.IStandaloneCodeEditor) {
  const block = findBlockAtSelection(editor);
  if (!block) {
    window.alert("Place the cursor inside a commutative block first.");
    return false;
  }

  openCommutativeModal(editor, block);
  return true;
}

export const commutativePlugin: PluginDefinition = {
  id: "commutative",
  label: "Commutative",
  description: "Adds right-pane preview rendering and Quiver-based editing for fenced commutative blocks.",
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

    context.registerCommand({
      id: EDIT_CURRENT_COMMAND_ID,
      title: "Edit: Current Commutative Diagram",
      keywords: ["diagram", "quiver", "commutative", "graph", "markdown"],
      handler() {
        const editor = activeMarkdownEditor;
        if (!editor) {
          return;
        }
        editCurrentCommutativeBlock(editor);
      }
    });

    context.registerMarkdownEditorFeature({
      id: "commutative-markdown-source-folding",
      matches(document) {
        return isMarkdownDocument(document);
      },
      onMount(editor, monaco, document) {
        if (!isMarkdownDocument(document)) {
          return;
        }

        activeMarkdownEditor = editor;
        activeMonacoApi = monaco;
        let blockSignature = "";
        let refreshTimer = 0;
        const refresh = () => {
          refreshTimer = 0;
          const model = editor.getModel();
          if (!model) {
            return;
          }

          const blocks = findCommutativeBlocks(model);
          const nextSignature = getBlockSignature(blocks);
          if (nextSignature === blockSignature) {
            return;
          }

          blockSignature = nextSignature;
          foldCommutativeBlocks(editor, blocks);
        };
        const scheduleRefresh = (delay = 160) => {
          if (refreshTimer) {
            window.clearTimeout(refreshTimer);
          }
          refreshTimer = window.setTimeout(refresh, delay);
        };
        const focusDisposable = editor.onDidFocusEditorText(() => {
          activeMarkdownEditor = editor;
          activeMonacoApi = monaco;
        });

        scheduleRefresh(320);
        const contentDisposable = editor.onDidChangeModelContent((event) => {
          if (blockSignature || contentChangeMayAffectCommutativeBlocks(editor, event)) {
            scheduleRefresh();
          }
        });
        const modelDisposable = editor.onDidChangeModel(() => {
          blockSignature = "";
          scheduleRefresh();
        });

        return () => {
          if (activeMarkdownEditor === editor) {
            activeMarkdownEditor = null;
          }
          if (activeMonacoApi === monaco) {
            activeMonacoApi = null;
          }
          if (refreshTimer) {
            window.clearTimeout(refreshTimer);
          }
          focusDisposable.dispose();
          contentDisposable.dispose();
          modelDisposable.dispose();
        };
      }
    });
  }
};
