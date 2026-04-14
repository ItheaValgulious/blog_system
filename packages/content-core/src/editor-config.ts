import type {
  EditorConfig,
  EditorConfigValidation,
  EditorKeybinding,
  EditorSnippet
} from "./types.js";

export const snippetSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "body"],
    properties: {
      name: { type: "string", minLength: 1 },
      scope: { type: "string" },
      prefix: {
        anyOf: [
          { type: "string" },
          {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1
          }
        ]
      },
      key: { type: "string" },
      body: {
        anyOf: [
          { type: "string" },
          {
            type: "array",
            items: { type: "string" }
          }
        ]
      },
      description: { type: "string" }
    }
  }
} as const;

export const keybindingSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["key", "command"],
    properties: {
      key: { type: "string", minLength: 1 },
      command: { type: "string", minLength: 1 },
      when: { type: "string" },
      args: { type: "object", additionalProperties: true }
    }
  }
} as const;

export function normalizeSnippetPrefixes(snippet: EditorSnippet): string[] {
  if (Array.isArray(snippet.prefix)) {
    return snippet.prefix.map((prefix) => prefix.trim()).filter(Boolean);
  }

  if (typeof snippet.prefix === "string" && snippet.prefix.trim()) {
    return [snippet.prefix.trim()];
  }

  return [];
}

export function normalizeEditorConfig(config: EditorConfig): EditorConfig {
  return {
    snippets: config.snippets.map((snippet) => ({
      ...snippet,
      prefix: normalizeSnippetPrefixes(snippet)
    })),
    keybindings: config.keybindings.map((keybinding) => ({
      ...keybinding,
      key: keybinding.key.trim()
    }))
  };
}

function collectDuplicateKeys(snippets: EditorSnippet[], keybindings: EditorKeybinding[]) {
  const buckets = new Map<string, string[]>();

  for (const snippet of snippets) {
    if (snippet.key?.trim()) {
      const normalized = snippet.key.trim().toLowerCase();
      buckets.set(normalized, [...(buckets.get(normalized) ?? []), `snippet:${snippet.name}`]);
    }
  }

  for (const keybinding of keybindings) {
    const normalized = keybinding.key.trim().toLowerCase();
    buckets.set(normalized, [...(buckets.get(normalized) ?? []), `keybinding:${keybinding.command}`]);
  }

  return [...buckets.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([key, owners]) => `Shortcut "${key}" is declared by ${owners.join(", ")}`);
}

export function validateEditorConfigShape(config: EditorConfig): EditorConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedConfig = normalizeEditorConfig(config);

  for (const snippet of normalizedConfig.snippets) {
    if (normalizeSnippetPrefixes(snippet).length === 0 && !snippet.key) {
      warnings.push(`Snippet "${snippet.name}" has neither prefix nor key.`);
    }
  }

  const duplicateNameSet = new Set<string>();

  for (const snippet of normalizedConfig.snippets) {
    const normalized = snippet.name.trim().toLowerCase();
    if (duplicateNameSet.has(normalized)) {
      errors.push(`Snippet name "${snippet.name}" is duplicated.`);
    }
    duplicateNameSet.add(normalized);
  }

  errors.push(...collectDuplicateKeys(normalizedConfig.snippets, normalizedConfig.keybindings));

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
