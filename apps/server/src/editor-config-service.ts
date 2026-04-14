import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import {
  keybindingSchema,
  normalizeEditorConfig,
  snippetSchema,
  type EditorKeybinding,
  type EditorSnippet
} from "@blog-system/content-core";

const ajv = new Ajv({ allErrors: true });
const validateSnippets = ajv.compile<EditorSnippet[]>(snippetSchema);
const validateKeybindings = ajv.compile<EditorKeybinding[]>(keybindingSchema);

export interface LoadedEditorConfig {
  markdownSnippets: EditorSnippet[];
  latexSnippets: EditorSnippet[];
  keybindings: EditorKeybinding[];
  markdownSnippetsRaw: string;
  latexSnippetsRaw: string;
  keybindingsRaw: string;
}

function getConfigPaths(editorConfigDir: string) {
  return {
    markdownSnippets: path.join(editorConfigDir, "markdown.snippets.json"),
    latexSnippets: path.join(editorConfigDir, "latex.snippets.json"),
    legacySnippets: path.join(editorConfigDir, "snippets.json"),
    keybindings: path.join(editorConfigDir, "keybindings.json")
  };
}

async function readOptionalFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function normalizeSnippetList(snippets: EditorSnippet[]) {
  return normalizeEditorConfig({
    snippets,
    keybindings: []
  }).snippets;
}

function normalizeKeybindingList(keybindings: EditorKeybinding[]) {
  return normalizeEditorConfig({
    snippets: [],
    keybindings
  }).keybindings;
}

function collectLanguageWarnings(language: string, snippets: EditorSnippet[]) {
  return snippets
    .filter((snippet) => !snippet.key && snippet.prefix.length === 0)
    .map((snippet) => `${language} snippet "${snippet.name}" has neither prefix nor key.`);
}

function collectDuplicateNames(language: string, snippets: EditorSnippet[]) {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const snippet of snippets) {
    const normalizedName = snippet.name.trim().toLowerCase();

    if (seen.has(normalizedName)) {
      errors.push(`${language} snippet name "${snippet.name}" is duplicated.`);
    }

    seen.add(normalizedName);
  }

  return errors;
}

function collectShortcutConflicts(
  language: string,
  snippets: EditorSnippet[],
  keybindings: EditorKeybinding[]
) {
  const errors: string[] = [];
  const ownersByKey = new Map<string, string[]>();

  for (const snippet of snippets) {
    if (!snippet.key?.trim()) {
      continue;
    }

    const normalizedKey = snippet.key.trim().toLowerCase();
    ownersByKey.set(normalizedKey, [
      ...(ownersByKey.get(normalizedKey) ?? []),
      `${language} snippet:${snippet.name}`
    ]);
  }

  for (const keybinding of keybindings) {
    const normalizedKey = keybinding.key.trim().toLowerCase();
    ownersByKey.set(normalizedKey, [
      ...(ownersByKey.get(normalizedKey) ?? []),
      `keybinding:${keybinding.command}`
    ]);
  }

  for (const [key, owners] of ownersByKey.entries()) {
    if (owners.length > 1) {
      errors.push(`Shortcut "${key}" is declared by ${owners.join(", ")}`);
    }
  }

  return errors;
}

function validateSnippetArray(label: string, snippets: unknown) {
  if (validateSnippets(snippets)) {
    return;
  }

  const message = (validateSnippets.errors ?? [])
    .map((error) => `${label}${error.instancePath} ${error.message}`)
    .join("; ");
  throw new Error(message);
}

function validateKeybindingArray(keybindings: unknown) {
  if (validateKeybindings(keybindings)) {
    return;
  }

  const message = (validateKeybindings.errors ?? [])
    .map((error) => `keybindings${error.instancePath} ${error.message}`)
    .join("; ");
  throw new Error(message);
}

export async function loadEditorConfig(editorConfigDir: string): Promise<LoadedEditorConfig> {
  const configPaths = getConfigPaths(editorConfigDir);
  const [markdownSnippetsRaw, legacySnippetsRaw, latexSnippetsRaw, keybindingsRaw] = await Promise.all([
    readOptionalFile(configPaths.markdownSnippets),
    readOptionalFile(configPaths.legacySnippets),
    readOptionalFile(configPaths.latexSnippets),
    readOptionalFile(configPaths.keybindings)
  ]);

  const resolvedMarkdownSnippetsRaw = markdownSnippetsRaw ?? legacySnippetsRaw ?? "[]\n";
  const resolvedLatexSnippetsRaw = latexSnippetsRaw ?? "[]\n";
  const resolvedKeybindingsRaw = keybindingsRaw ?? "[]\n";

  return {
    markdownSnippetsRaw: resolvedMarkdownSnippetsRaw,
    latexSnippetsRaw: resolvedLatexSnippetsRaw,
    keybindingsRaw: resolvedKeybindingsRaw,
    markdownSnippets: normalizeSnippetList(JSON.parse(resolvedMarkdownSnippetsRaw) as EditorSnippet[]),
    latexSnippets: normalizeSnippetList(JSON.parse(resolvedLatexSnippetsRaw) as EditorSnippet[]),
    keybindings: normalizeKeybindingList(JSON.parse(resolvedKeybindingsRaw) as EditorKeybinding[])
  };
}

export function validateEditorConfigPayload(
  markdownSnippets: unknown,
  latexSnippets: unknown,
  keybindings: unknown
) {
  validateSnippetArray("markdownSnippets", markdownSnippets);
  validateSnippetArray("latexSnippets", latexSnippets);
  validateKeybindingArray(keybindings);

  const normalizedMarkdownSnippets = normalizeSnippetList(markdownSnippets as EditorSnippet[]);
  const normalizedLatexSnippets = normalizeSnippetList(latexSnippets as EditorSnippet[]);
  const normalizedKeybindings = normalizeKeybindingList(keybindings as EditorKeybinding[]);

  const errors = [
    ...collectDuplicateNames("Markdown", normalizedMarkdownSnippets),
    ...collectDuplicateNames("LaTeX", normalizedLatexSnippets),
    ...collectShortcutConflicts("Markdown", normalizedMarkdownSnippets, normalizedKeybindings),
    ...collectShortcutConflicts("LaTeX", normalizedLatexSnippets, normalizedKeybindings)
  ];

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return {
    config: {
      markdownSnippets: normalizedMarkdownSnippets,
      latexSnippets: normalizedLatexSnippets,
      keybindings: normalizedKeybindings
    },
    warnings: [
      ...collectLanguageWarnings("Markdown", normalizedMarkdownSnippets),
      ...collectLanguageWarnings("LaTeX", normalizedLatexSnippets)
    ]
  };
}

export async function saveEditorConfig(
  editorConfigDir: string,
  markdownSnippetsRaw: string,
  latexSnippetsRaw: string,
  keybindingsRaw: string
): Promise<LoadedEditorConfig & { warnings: string[] }> {
  const parsedMarkdownSnippets = JSON.parse(markdownSnippetsRaw);
  const parsedLatexSnippets = JSON.parse(latexSnippetsRaw);
  const parsedKeybindings = JSON.parse(keybindingsRaw);
  const validation = validateEditorConfigPayload(
    parsedMarkdownSnippets,
    parsedLatexSnippets,
    parsedKeybindings
  );
  const configPaths = getConfigPaths(editorConfigDir);

  const normalizedMarkdownSnippetsRaw = `${JSON.stringify(validation.config.markdownSnippets, null, 2)}\n`;
  const normalizedLatexSnippetsRaw = `${JSON.stringify(validation.config.latexSnippets, null, 2)}\n`;
  const normalizedKeybindingsRaw = `${JSON.stringify(validation.config.keybindings, null, 2)}\n`;

  await fs.mkdir(editorConfigDir, { recursive: true });
  await Promise.all([
    fs.writeFile(configPaths.markdownSnippets, normalizedMarkdownSnippetsRaw, "utf8"),
    fs.writeFile(configPaths.latexSnippets, normalizedLatexSnippetsRaw, "utf8"),
    fs.writeFile(configPaths.keybindings, normalizedKeybindingsRaw, "utf8")
  ]);

  return {
    markdownSnippetsRaw: normalizedMarkdownSnippetsRaw,
    latexSnippetsRaw: normalizedLatexSnippetsRaw,
    keybindingsRaw: normalizedKeybindingsRaw,
    markdownSnippets: validation.config.markdownSnippets,
    latexSnippets: validation.config.latexSnippets,
    keybindings: validation.config.keybindings,
    warnings: validation.warnings
  };
}
