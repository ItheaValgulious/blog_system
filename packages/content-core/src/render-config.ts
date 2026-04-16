export interface RenderStyleEntry {
  directory: string;
  enable: boolean;
}

export interface RenderConfig {
  styles: RenderStyleEntry[];
}

export const renderConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["styles"],
  properties: {
    styles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["directory", "enable"],
        properties: {
          directory: { type: "string", minLength: 1 },
          enable: { type: "boolean" }
        }
      }
    }
  }
} as const;

export const defaultRenderConfig: RenderConfig = {
  styles: []
};

export function normalizeRenderConfig(input: Partial<RenderConfig> | null | undefined): RenderConfig {
  const styles = (
    Array.isArray(input?.styles) ? input.styles : []
  ) as Array<Partial<RenderStyleEntry> | null | undefined>;

  return {
    styles: styles
      .filter((style): style is Partial<RenderStyleEntry> => Boolean(style && typeof style === "object"))
      .map((style) => ({
        directory: typeof style.directory === "string" ? style.directory.trim().replace(/\\/g, "/") : "",
        enable: style.enable === true
      }))
      .filter((style) => style.directory.length > 0)
  };
}

export function findDuplicateRenderStyleDirectories(config: RenderConfig): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const style of config.styles) {
    const normalizedDirectory = style.directory.trim().toLowerCase();

    if (seen.has(normalizedDirectory)) {
      duplicates.push(style.directory);
      continue;
    }

    seen.add(normalizedDirectory);
  }

  return duplicates;
}

export function getEnabledRenderStyleDirectories(config: RenderConfig): string[] {
  return config.styles.filter((style) => style.enable).map((style) => style.directory);
}
