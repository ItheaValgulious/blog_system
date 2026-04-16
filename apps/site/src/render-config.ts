import { promises as fs } from "node:fs";
import path from "node:path";

import {
  defaultRenderConfig,
  findDuplicateRenderStyleDirectories,
  normalizeRenderConfig,
  type RenderConfig
} from "@blog-system/content-core";

const RENDER_DIRECTORY_NAME = "render";

export async function loadRenderConfig(configRoot: string): Promise<RenderConfig> {
  const configPath = path.join(configRoot, "render.json");

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const normalized = normalizeRenderConfig(JSON.parse(raw));
    const duplicates = findDuplicateRenderStyleDirectories(normalized);

    if (duplicates.length > 0) {
      throw new Error(`renderConfig style directories must be unique: ${duplicates.join(", ")}`);
    }

    return normalized;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultRenderConfig;
    }

    throw error;
  }
}

export function getRenderStylesRoot(configRoot: string) {
  return path.join(configRoot, RENDER_DIRECTORY_NAME);
}

export function resolveRenderStyleSourcePath(configRoot: string, directory: string) {
  return path.join(getRenderStylesRoot(configRoot), directory);
}

export function toRenderStyleUrlPath(directory: string, basePrefix: string) {
  const encodedPath = directory
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${basePrefix}/render/${encodedPath}`.replace(/\/{2,}/g, "/");
}
