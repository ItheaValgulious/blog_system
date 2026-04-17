export type ThemeAssetType = "css" | "js";

export interface ThemeAssetConfig {
  adminPreview: boolean;
  fileName: string;
  type: ThemeAssetType;
}

export interface ThemeGroupConfig {
  enable: boolean;
  files: ThemeAssetConfig[];
  label: string;
}

export interface ThemeGroupSummary extends ThemeGroupConfig {
  groupId: string;
}

export const themeAssetConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fileName", "type", "adminPreview"],
  properties: {
    fileName: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["css", "js"] },
    adminPreview: { type: "boolean" }
  }
} as const;

export const themeGroupConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "enable", "files"],
  properties: {
    label: { type: "string", minLength: 1 },
    enable: { type: "boolean" },
    files: {
      type: "array",
      items: themeAssetConfigSchema
    }
  }
} as const;

export const defaultThemeGroupConfig: ThemeGroupConfig = {
  enable: true,
  files: [],
  label: "Theme Group"
};

function normalizeThemeAssetFileName(fileName: string, type: ThemeAssetType) {
  const trimmed = fileName.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const defaultExtension = type === "css" ? ".css" : ".js";
  const withExtension = trimmed.toLowerCase().endsWith(defaultExtension) ? trimmed : `${trimmed}${defaultExtension}`;
  return withExtension.replace(/\/{2,}/g, "/");
}

export function normalizeThemeGroupConfig(
  input: Partial<ThemeGroupConfig> | null | undefined
): ThemeGroupConfig {
  const files = Array.isArray(input?.files) ? input.files : [];

  return {
    enable: input?.enable !== false,
    files: files
      .filter((file) => Boolean(file && typeof file === "object"))
      .map((file) => {
        const type: ThemeAssetType = file.type === "js" ? "js" : "css";
        return {
          adminPreview: file.adminPreview === true,
          fileName:
            typeof file.fileName === "string" && file.fileName.trim()
              ? normalizeThemeAssetFileName(file.fileName, type)
              : "",
          type
        };
      })
      .filter((file) => file.fileName.length > 0)
      .filter((file, index, entries) =>
        entries.findIndex(
          (candidate) => candidate.fileName.toLowerCase() === file.fileName.toLowerCase()
        ) === index
      ),
    label: typeof input?.label === "string" && input.label.trim() ? input.label.trim() : defaultThemeGroupConfig.label
  };
}

export function toThemeAssetLanguage(type: ThemeAssetType) {
  return type === "js" ? "javascript" : "css";
}
