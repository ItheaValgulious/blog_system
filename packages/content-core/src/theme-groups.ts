export type ThemeAssetType = "css" | "js";
export type ThemeColorMode = "light" | "dark";

export interface ThemeCssAssetConfig {
  adminPreview: boolean;
  colorMode: ThemeColorMode;
  fileName: string;
  type: "css";
}

export interface ThemeJsAssetConfig {
  adminPreview: boolean;
  fileName: string;
  type: "js";
}

export type ThemeAssetConfig = ThemeCssAssetConfig | ThemeJsAssetConfig;

export interface ThemeGroupConfig {
  enable: boolean;
  files: ThemeAssetConfig[];
  label: string;
  mode: ThemeColorMode;
}

export interface ThemeGroupSummary extends ThemeGroupConfig {
  groupId: string;
}

const themeColorModeSchema = {
  type: "string",
  enum: ["light", "dark"]
} as const;

const themeCssAssetConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fileName", "type", "adminPreview", "colorMode"],
  properties: {
    adminPreview: { type: "boolean" },
    colorMode: themeColorModeSchema,
    fileName: { type: "string", minLength: 1 },
    type: { const: "css" }
  }
} as const;

const themeJsAssetConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fileName", "type", "adminPreview"],
  properties: {
    adminPreview: { type: "boolean" },
    fileName: { type: "string", minLength: 1 },
    type: { const: "js" }
  }
} as const;

export const themeAssetConfigSchema = {
  oneOf: [themeCssAssetConfigSchema, themeJsAssetConfigSchema]
} as const;

export const themeGroupConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "enable", "files", "mode"],
  properties: {
    enable: { type: "boolean" },
    files: {
      type: "array",
      items: themeAssetConfigSchema
    },
    label: { type: "string", minLength: 1 },
    mode: themeColorModeSchema
  }
} as const;

export const defaultThemeGroupConfig: ThemeGroupConfig = {
  enable: true,
  files: [],
  label: "Theme Group",
  mode: "light"
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeThemeAssetFileName(fileName: string, type: ThemeAssetType) {
  const trimmed = fileName.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const defaultExtension = type === "css" ? ".css" : ".js";
  const withExtension = trimmed.toLowerCase().endsWith(defaultExtension) ? trimmed : `${trimmed}${defaultExtension}`;
  return withExtension.replace(/\/{2,}/g, "/");
}

export function inferThemeColorModeFromFileName(fileName: string): ThemeColorMode | null {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith(".light.css")) {
    return "light";
  }

  if (normalized.endsWith(".dark.css")) {
    return "dark";
  }

  return null;
}

export function withThemeColorModeFileName(fileName: string, mode: ThemeColorMode) {
  const normalized = normalizeThemeAssetFileName(fileName, "css");
  const baseName = normalized.replace(/\.(light|dark)\.css$/i, ".css");
  return baseName.replace(/\.css$/i, `.${mode}.css`);
}

function parseHexColor(token: string) {
  const hex = token.slice(1);

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b, a = "f"] = hex.split("");
    return {
      a: parseInt(`${a}${a}`, 16) / 255,
      b: parseInt(`${b}${b}`, 16),
      g: parseInt(`${g}${g}`, 16),
      r: parseInt(`${r}${r}`, 16)
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      b: parseInt(hex.slice(4, 6), 16),
      g: parseInt(hex.slice(2, 4), 16),
      r: parseInt(hex.slice(0, 2), 16)
    };
  }

  return null;
}

function parseRgbChannel(value: string) {
  const trimmed = value.trim();

  if (trimmed.endsWith("%")) {
    return clamp((parseFloat(trimmed) / 100) * 255, 0, 255);
  }

  return clamp(parseFloat(trimmed), 0, 255);
}

function parseAlphaChannel(value: string) {
  const trimmed = value.trim();

  if (trimmed.endsWith("%")) {
    return clamp(parseFloat(trimmed) / 100, 0, 1);
  }

  return clamp(parseFloat(trimmed), 0, 1);
}

function hueToRgb(p: number, q: number, t: number) {
  let next = t;

  if (next < 0) {
    next += 1;
  }

  if (next > 1) {
    next -= 1;
  }

  if (next < 1 / 6) {
    return p + (q - p) * 6 * next;
  }

  if (next < 1 / 2) {
    return q;
  }

  if (next < 2 / 3) {
    return p + (q - p) * (2 / 3 - next) * 6;
  }

  return p;
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    const channel = Math.round(l * 255);
    return { b: channel, g: channel, r: channel };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = ((h % 360) + 360) % 360 / 360;

  return {
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255)
  };
}

function parseHslColor(token: string) {
  const body = token.slice(token.indexOf("(") + 1, -1).trim();
  const normalized = body.replace(/\s*\/\s*/g, ",");
  const parts = normalized
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return null;
  }

  const hue = parseFloat(parts[0]);
  const saturation = clamp(parseFloat(parts[1]) / 100, 0, 1);
  const lightness = clamp(parseFloat(parts[2]) / 100, 0, 1);
  const alpha = parts[3] ? parseAlphaChannel(parts[3]) : 1;
  const rgb = hslToRgb(hue, saturation, lightness);

  return {
    ...rgb,
    a: alpha
  };
}

function parseCssColor(token: string) {
  const normalized = token.trim().toLowerCase();

  if (normalized === "transparent") {
    return { a: 0, b: 0, g: 0, r: 0 };
  }

  if (normalized === "white") {
    return { a: 1, b: 255, g: 255, r: 255 };
  }

  if (normalized === "black") {
    return { a: 1, b: 0, g: 0, r: 0 };
  }

  if (normalized.startsWith("#")) {
    return parseHexColor(normalized);
  }

  if (normalized.startsWith("rgb")) {
    const body = normalized.slice(normalized.indexOf("(") + 1, -1).trim();
    const parts = body
      .replace(/\s*\/\s*/g, ",")
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 3) {
      return null;
    }

    return {
      a: parts[3] ? parseAlphaChannel(parts[3]) : 1,
      b: parseRgbChannel(parts[2]),
      g: parseRgbChannel(parts[1]),
      r: parseRgbChannel(parts[0])
    };
  }

  if (normalized.startsWith("hsl")) {
    return parseHslColor(normalized);
  }

  return null;
}

function rgbToHsl(r: number, g: number, b: number) {
  const nextR = r / 255;
  const nextG = g / 255;
  const nextB = b / 255;
  const max = Math.max(nextR, nextG, nextB);
  const min = Math.min(nextR, nextG, nextB);
  const lightness = (max + min) / 2;

  if (max === min) {
    return {
      h: 0,
      l: lightness,
      s: 0
    };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case nextR:
      hue = (nextG - nextB) / delta + (nextG < nextB ? 6 : 0);
      break;
    case nextG:
      hue = (nextB - nextR) / delta + 2;
      break;
    default:
      hue = (nextR - nextG) / delta + 4;
      break;
  }

  return {
    h: hue * 60,
    l: lightness,
    s: saturation
  };
}

function relativeLuminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function formatCssColor(token: string, r: number, g: number, b: number, a: number) {
  if (a < 1) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
  }

  if (token.trim().toLowerCase() === "white" || token.trim().toLowerCase() === "black") {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function adaptLightness(lightness: number, sourceMode: ThemeColorMode, targetMode: ThemeColorMode) {
  if (sourceMode === targetMode) {
    return lightness;
  }

  if (targetMode === "dark") {
    return lightness >= 0.6
      ? clamp(0.08 + (1 - lightness) * 0.3, 0.08, 0.28)
      : clamp(0.82 - lightness * 0.28, 0.32, 0.9);
  }

  return lightness <= 0.4
    ? clamp(0.9 - lightness * 0.24, 0.7, 0.95)
    : clamp(0.18 + (1 - lightness) * 0.32, 0.12, 0.42);
}

function adaptSaturation(saturation: number, targetMode: ThemeColorMode) {
  return targetMode === "dark"
    ? clamp(saturation + (1 - saturation) * 0.08, 0, 1)
    : clamp(saturation * 0.96, 0, 1);
}

const CSS_COLOR_TOKEN_PATTERN = /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|transparent)\b/gi;
const CSS_DECLARATION_PATTERN = /([-\w]+)\s*:\s*([^;{}]+);/g;

function isBackgroundProperty(property: string) {
  return (
    property === "background" ||
    property === "background-color" ||
    (property.startsWith("--") && /(bg|background|paper|surface|canvas|panel|card|sheet)/i.test(property))
  );
}

function isTextProperty(property: string) {
  return (
    property === "color" ||
    (property.startsWith("--") && /(ink|foreground|fg|text|copy|muted|heading|title)/i.test(property))
  );
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function inferThemeColorModeFromCss(cssText: string): ThemeColorMode {
  const declaredColorScheme = cssText.match(/color-scheme\s*:\s*(light|dark)\b/i)?.[1];
  if (declaredColorScheme === "light" || declaredColorScheme === "dark") {
    return declaredColorScheme;
  }

  const backgroundSamples: number[] = [];
  const textSamples: number[] = [];
  const allSamples: number[] = [];

  for (const match of cssText.matchAll(CSS_DECLARATION_PATTERN)) {
    const property = match[1]?.trim().toLowerCase() ?? "";
    const value = match[2] ?? "";

    for (const token of value.match(CSS_COLOR_TOKEN_PATTERN) ?? []) {
      const color = parseCssColor(token);

      if (!color || color.a <= 0.04) {
        continue;
      }

      const luminance = relativeLuminance(color.r, color.g, color.b);
      allSamples.push(luminance);

      if (isBackgroundProperty(property)) {
        backgroundSamples.push(luminance);
      } else if (isTextProperty(property)) {
        textSamples.push(luminance);
      }
    }
  }

  if (backgroundSamples.length > 0 && textSamples.length > 0) {
    return average(backgroundSamples) >= average(textSamples) ? "light" : "dark";
  }

  if (backgroundSamples.length > 0) {
    return average(backgroundSamples) >= 0.5 ? "light" : "dark";
  }

  if (textSamples.length > 0) {
    return average(textSamples) <= 0.45 ? "light" : "dark";
  }

  if (allSamples.length > 0) {
    return average(allSamples) >= 0.5 ? "light" : "dark";
  }

  return "light";
}

export function buildThemeColorModeVariantCss(
  cssText: string,
  sourceMode: ThemeColorMode,
  targetMode: ThemeColorMode
) {
  if (sourceMode === targetMode) {
    return cssText;
  }

  const nextCss = cssText
    .replace(/color-scheme\s*:\s*(light|dark)\b/gi, `color-scheme: ${targetMode}`)
    .replace(CSS_COLOR_TOKEN_PATTERN, (token) => {
      const parsed = parseCssColor(token);

      if (!parsed || parsed.a <= 0.001) {
        return token;
      }

      const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
      const nextLightness = adaptLightness(hsl.l, sourceMode, targetMode);
      const nextSaturation = adaptSaturation(hsl.s, targetMode);
      const nextRgb = hslToRgb(hsl.h, nextSaturation, nextLightness);

      return formatCssColor(token, nextRgb.r, nextRgb.g, nextRgb.b, parsed.a);
    });

  return nextCss;
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
        const cssFile = file as Partial<ThemeCssAssetConfig>;
        const fileName =
          typeof file.fileName === "string" && file.fileName.trim()
            ? normalizeThemeAssetFileName(file.fileName, type)
            : "";

        if (type === "js") {
          return {
            adminPreview: file.adminPreview === true,
            fileName,
            type
          } satisfies ThemeJsAssetConfig;
        }

        return {
          adminPreview: file.adminPreview === true,
          colorMode: cssFile.colorMode === "dark" ? "dark" : "light",
          fileName,
          type
        } satisfies ThemeCssAssetConfig;
      })
      .filter((file) => file.fileName.length > 0)
      .filter((file, index, entries) =>
        entries.findIndex(
          (candidate) => candidate.fileName.toLowerCase() === file.fileName.toLowerCase()
        ) === index
      ),
    label: typeof input?.label === "string" && input.label.trim() ? input.label.trim() : defaultThemeGroupConfig.label,
    mode: input?.mode === "dark" ? "dark" : "light"
  };
}

export function toThemeAssetLanguage(type: ThemeAssetType) {
  return type === "js" ? "javascript" : "css";
}
