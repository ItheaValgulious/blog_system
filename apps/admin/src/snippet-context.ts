import {
  createInitialMarkdownMathContextState,
  scanMarkdownMathLine
} from "./markdown-math-tokenization";
import type { SnippetLanguageId } from "./workbench/types";

export function getSnippetLanguageAtOffset(text: string, offset: number): SnippetLanguageId {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const inspectedText = text.slice(0, safeOffset);
  const lines = inspectedText.split("\n");
  let state = createInitialMarkdownMathContextState();

  for (const line of lines) {
    state = scanMarkdownMathLine(line, state).nextState;
  }

  return state.inMath ? "latex" : "markdown";
}
