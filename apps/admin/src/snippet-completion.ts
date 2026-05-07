import type { NormalizedSnippet } from "./workbench/types";

const WORD_SNIPPET_PREFIX_PATTERN = /^[A-Za-z0-9_-]+$/;
const TRAILING_WORD_PATTERN = /[A-Za-z0-9_-]+$/;
const LEADING_SYMBOL_PATTERN = /^[^A-Za-z0-9_-]+/;
const WORD_CHARACTER_PATTERN = /[A-Za-z0-9_-]/;

export interface SnippetCompletionMatch {
  carryOver: boolean;
  prefix: string;
  replacementText: string;
  snippet: NormalizedSnippet;
}

export interface ActiveSnippetResolution {
  currentLanguageSnippets: NormalizedSnippet[];
  matches: SnippetCompletionMatch[];
}

function isWordCharacter(value: string | undefined) {
  return typeof value === "string" && WORD_CHARACTER_PATTERN.test(value);
}

function startsWithWordCharacter(prefix: string) {
  return isWordCharacter(prefix[0]);
}

function findWordSnippetMatch(linePrefix: string, prefix: string) {
  const trailingWord = TRAILING_WORD_PATTERN.exec(linePrefix)?.[0] ?? "";
  if (!trailingWord) {
    return "";
  }

  return prefix.toLowerCase().startsWith(trailingWord.toLowerCase()) ? trailingWord : "";
}

function findStructuredSnippetMatch(linePrefix: string, prefix: string) {
  if (!linePrefix || !prefix) {
    return "";
  }

  let searchFrom = linePrefix.length - 1;
  let bestMatch = "";
  while (searchFrom >= 0) {
    const startIndex = linePrefix.lastIndexOf(prefix[0], searchFrom);
    if (startIndex < 0) {
      break;
    }

    const replacementText = linePrefix.slice(startIndex);
    const hasWordBoundary =
      !startsWithWordCharacter(prefix) ||
      startIndex === 0 ||
      !isWordCharacter(linePrefix[startIndex - 1]);

    if (
      hasWordBoundary &&
      prefix.startsWith(replacementText) &&
      replacementText.length > bestMatch.length
    ) {
      bestMatch = replacementText;
    }

    searchFrom = startIndex - 1;
  }

  return bestMatch;
}

export function getSnippetCompletionReplacementText(linePrefix: string, prefix: string) {
  if (!prefix) {
    return "";
  }

  return WORD_SNIPPET_PREFIX_PATTERN.test(prefix)
    ? findWordSnippetMatch(linePrefix, prefix)
    : findStructuredSnippetMatch(linePrefix, prefix);
}

export function getMatchingSnippetCompletions(
  linePrefix: string,
  snippets: NormalizedSnippet[]
) {
  const matches: SnippetCompletionMatch[] = [];

  snippets.forEach((snippet) => {
    snippet.prefix.forEach((prefix) => {
      const replacementText = getSnippetCompletionReplacementText(linePrefix, prefix);
      if (!replacementText) {
        return;
      }

      matches.push({
        carryOver: false,
        snippet,
        prefix,
        replacementText
      });
    });
  });

  return matches;
}

export function getSnippetTriggerCharacters(snippets: NormalizedSnippet[]) {
  return Array.from(
    new Set(
      snippets
        .flatMap((snippet) => snippet.prefix)
        .flatMap((prefix) => [...(LEADING_SYMBOL_PATTERN.exec(prefix)?.[0] ?? "")])
        .filter(Boolean)
      )
  );
}

export function resolveActiveSnippetMatches(
  linePrefix: string,
  snippetLanguage: "markdown" | "latex",
  markdownSnippets: NormalizedSnippet[],
  latexSnippets: NormalizedSnippet[]
): ActiveSnippetResolution {
  const currentLanguageSnippets =
    snippetLanguage === "latex" ? latexSnippets : markdownSnippets;
  const currentLanguageMatches = getMatchingSnippetCompletions(linePrefix, currentLanguageSnippets);

  if (snippetLanguage !== "latex") {
    return {
      currentLanguageSnippets,
      matches: currentLanguageMatches
    };
  }

  const markdownCarryOverMatches = getMatchingSnippetCompletions(linePrefix, markdownSnippets).map(
    (match) => ({
      ...match,
      carryOver: true
    })
  );

  return {
    currentLanguageSnippets,
    matches: [...currentLanguageMatches, ...markdownCarryOverMatches]
  };
}
