import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv from "ajv";

const siteThemeConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["colors"],
  properties: {
    backgroundImage: { type: "string" },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["accent", "accentAlt", "background", "foreground", "line", "muted", "paper", "shadow"],
      properties: {
        accent: { type: "string", minLength: 1 },
        accentAlt: { type: "string", minLength: 1 },
        background: { type: "string", minLength: 1 },
        foreground: { type: "string", minLength: 1 },
        line: { type: "string", minLength: 1 },
        muted: { type: "string", minLength: 1 },
        paper: { type: "string", minLength: 1 },
        shadow: { type: "string", minLength: 1 }
      }
    }
  }
} as const;

const ajv = new Ajv({ allErrors: true });
const validateSiteThemeConfig = ajv.compile(siteThemeConfigSchema);

function getSiteThemeConfigPath(configRoot: string, themeId: string) {
  return path.join(configRoot, `site-theme.${themeId}.json`);
}

export async function loadSiteThemeConfig(configRoot: string, themeId: string) {
  const configPath = getSiteThemeConfigPath(configRoot, themeId);
  const raw = await fs.readFile(configPath, "utf8");
  const value = JSON.parse(raw);

  if (!validateSiteThemeConfig(value)) {
    const message = (validateSiteThemeConfig.errors ?? [])
      .map((error) => `siteTheme${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  return {
    raw,
    value
  };
}

export async function saveSiteThemeConfig(configRoot: string, themeId: string, raw: string) {
  const value = JSON.parse(raw);

  if (!validateSiteThemeConfig(value)) {
    const message = (validateSiteThemeConfig.errors ?? [])
      .map((error) => `siteTheme${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  const configPath = getSiteThemeConfigPath(configRoot, themeId);
  const normalizedRaw = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, normalizedRaw, "utf8");

  return {
    raw: normalizedRaw,
    value
  };
}
