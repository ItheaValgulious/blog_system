import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import {
  defaultMarkdownBlockConfig,
  findDuplicateMarkdownBlockRuleMarkers,
  markdownBlockConfigSchema,
  normalizeMarkdownBlockConfig,
  type MarkdownBlockConfig
} from "@blog-system/content-core";

const ajv = new Ajv({ allErrors: true });
const validateMarkdownBlockConfig = ajv.compile<MarkdownBlockConfig>(markdownBlockConfigSchema);

function getMarkdownBlockConfigPath(configRoot: string) {
  return path.join(configRoot, "markdown-blocks.json");
}

function validateParsedMarkdownBlockConfig(value: unknown) {
  if (!validateMarkdownBlockConfig(value)) {
    const message = (validateMarkdownBlockConfig.errors ?? [])
      .map((error) => `markdownBlockConfig${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  const normalized = normalizeMarkdownBlockConfig(value);
  const duplicates = findDuplicateMarkdownBlockRuleMarkers(normalized);

  if (duplicates.duplicateStarts.length > 0 || duplicates.duplicateEnds.length > 0) {
    throw new Error(
      [
        ...duplicates.duplicateStarts.map((entry) => `Duplicate start marker "${entry}".`),
        ...duplicates.duplicateEnds.map((entry) => `Duplicate end marker "${entry}".`)
      ].join(" ")
    );
  }

  return normalized;
}

export async function loadMarkdownBlockConfig(configRoot: string) {
  const configPath = getMarkdownBlockConfigPath(configRoot);

  try {
    const raw = await fs.readFile(configPath, "utf8");
    return validateParsedMarkdownBlockConfig(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    return defaultMarkdownBlockConfig;
  }
}
