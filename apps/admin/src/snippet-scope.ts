import { matchesSnippetScope, normalizeEditorConfig, type EditorSnippet } from "@blog-system/content-core";

import type { NormalizedSnippet, SnippetLanguageId } from "./workbench/types";

export function normalizeWorkbenchSnippets(
  snippets: EditorSnippet[],
  environment: SnippetLanguageId
): NormalizedSnippet[] {
  return normalizeEditorConfig({
    snippets,
    keybindings: []
  }).snippets.map((snippet) => ({
    ...snippet,
    environment
  })) as NormalizedSnippet[];
}

export function getSnippetsForLanguage(
  snippets: NormalizedSnippet[],
  languageId: SnippetLanguageId
) {
  return snippets.filter(
    (snippet) => snippet.environment === languageId && matchesSnippetScope(snippet, languageId)
  );
}
