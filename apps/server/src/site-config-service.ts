import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv from "ajv";

export const siteConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["siteTitle", "theme", "enabledPlugins"],
  properties: {
    siteTitle: { type: "string", minLength: 1 },
    siteDescription: { type: "string" },
    backgroundImage: { type: "string" },
    theme: { type: "string", minLength: 1 },
    enabledPlugins: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true
    },
    about: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        body: { type: "string" }
      }
    }
  }
} as const;

const ajv = new Ajv({ allErrors: true });
const validateSiteConfig = ajv.compile(siteConfigSchema);

function getSiteConfigPath(configRoot: string) {
  return path.join(configRoot, "site.json");
}

export async function loadSiteConfig(configRoot: string) {
  const siteConfigPath = getSiteConfigPath(configRoot);
  const raw = await fs.readFile(siteConfigPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!validateSiteConfig(parsed)) {
    const message = (validateSiteConfig.errors ?? [])
      .map((error) => `siteConfig${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  return {
    raw,
    value: parsed
  };
}

export async function saveSiteConfig(configRoot: string, raw: string) {
  const parsed = JSON.parse(raw);

  if (!validateSiteConfig(parsed)) {
    const message = (validateSiteConfig.errors ?? [])
      .map((error) => `siteConfig${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  const siteConfigPath = getSiteConfigPath(configRoot);
  const normalizedRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  await fs.mkdir(path.dirname(siteConfigPath), { recursive: true });
  await fs.writeFile(siteConfigPath, normalizedRaw, "utf8");

  return {
    raw: normalizedRaw,
    value: parsed
  };
}
