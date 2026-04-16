import { promises as fs } from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import {
  defaultRenderConfig,
  findDuplicateRenderStyleDirectories,
  normalizeRenderConfig,
  renderConfigSchema,
  toPosixPath,
  type RenderConfig
} from "@blog-system/content-core";

const ajv = new Ajv({ allErrors: true });
const validateRenderConfig = ajv.compile<RenderConfig>(renderConfigSchema);
const RENDER_DIRECTORY_NAME = "render";

function getRenderConfigPath(configRoot: string) {
  return path.join(configRoot, "render.json");
}

function getRenderDirectoryRoot(configRoot: string) {
  return path.join(configRoot, RENDER_DIRECTORY_NAME);
}

function assertNoDuplicateStyleDirectories(config: RenderConfig) {
  const duplicates = findDuplicateRenderStyleDirectories(config);

  if (duplicates.length === 0) {
    return;
  }

  throw new Error(`renderConfig style directories must be unique: ${duplicates.join(", ")}`);
}

function validateParsedRenderConfig(value: unknown): RenderConfig {
  if (!validateRenderConfig(value)) {
    const message = (validateRenderConfig.errors ?? [])
      .map((error) => `renderConfig${error.instancePath} ${error.message}`)
      .join("; ");
    throw new Error(message);
  }

  const normalized = normalizeRenderConfig(value);
  assertNoDuplicateStyleDirectories(normalized);
  return normalized;
}

function normalizeRenderStyleDirectory(directory: string, options?: { appendCssExtension?: boolean }) {
  const trimmed = toPosixPath(directory.trim()).replace(/^render\/+/i, "").replace(/\/{2,}/g, "/");

  if (!trimmed) {
    throw new Error("Render CSS directory is required.");
  }

  const nextDirectory =
    options?.appendCssExtension === false || trimmed.toLowerCase().endsWith(".css")
      ? trimmed
      : `${trimmed}.css`;

  if (!nextDirectory.toLowerCase().endsWith(".css")) {
    throw new Error("Render CSS files must end with .css.");
  }

  if (nextDirectory.split("/").some((segment) => segment === "." || segment === ".." || segment.length === 0)) {
    throw new Error("Render CSS directory is invalid.");
  }

  return nextDirectory;
}

function resolveRenderStyleAbsolutePath(configRoot: string, directory: string) {
  const renderRoot = path.resolve(getRenderDirectoryRoot(configRoot));
  const normalizedDirectory = normalizeRenderStyleDirectory(directory);
  const resolvedPath = path.resolve(renderRoot, normalizedDirectory);

  if (!resolvedPath.startsWith(renderRoot)) {
    throw new Error("Render CSS path escapes the render directory.");
  }

  return {
    absolutePath: resolvedPath,
    directory: normalizedDirectory
  };
}

function buildRenderStyleTemplate(directory: string) {
  return `/* config/render/${directory} */\n\n`;
}

async function ensureRenderStyleRegistered(
  configRoot: string,
  directory: string,
  options?: { enable?: boolean }
) {
  const loaded = await loadRenderConfig(configRoot);
  const normalizedDirectory = normalizeRenderStyleDirectory(directory);
  const existing = loaded.value.styles.find(
    (style) => style.directory.toLowerCase() === normalizedDirectory.toLowerCase()
  );

  if (existing) {
    if (existing.enable === (options?.enable ?? existing.enable)) {
      return loaded;
    }

    const nextConfig = {
      styles: loaded.value.styles.map((style) =>
        style.directory.toLowerCase() === normalizedDirectory.toLowerCase()
          ? { ...style, enable: options?.enable ?? style.enable }
          : style
      )
    };

    return saveRenderConfig(configRoot, JSON.stringify(nextConfig, null, 2));
  }

  const nextConfig = {
    styles: [
      ...loaded.value.styles,
      {
        directory: normalizedDirectory,
        enable: options?.enable ?? true
      }
    ]
  };

  return saveRenderConfig(configRoot, JSON.stringify(nextConfig, null, 2));
}

export async function loadRenderConfig(configRoot: string) {
  const renderConfigPath = getRenderConfigPath(configRoot);

  try {
    const raw = await fs.readFile(renderConfigPath, "utf8");
    return {
      raw,
      value: validateParsedRenderConfig(JSON.parse(raw))
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const raw = `${JSON.stringify(defaultRenderConfig, null, 2)}\n`;
    return {
      raw,
      value: defaultRenderConfig
    };
  }
}

export async function saveRenderConfig(configRoot: string, raw: string) {
  const normalized = validateParsedRenderConfig(JSON.parse(raw));
  const renderConfigPath = getRenderConfigPath(configRoot);
  const normalizedRaw = `${JSON.stringify(normalized, null, 2)}\n`;

  await fs.mkdir(path.dirname(renderConfigPath), { recursive: true });
  await fs.writeFile(renderConfigPath, normalizedRaw, "utf8");

  return {
    raw: normalizedRaw,
    value: normalized
  };
}

export function getRenderStylesRoot(configRoot: string) {
  return getRenderDirectoryRoot(configRoot);
}

export async function readRenderStyle(configRoot: string, directory: string) {
  const resolved = resolveRenderStyleAbsolutePath(configRoot, directory);
  const raw = await fs.readFile(resolved.absolutePath, "utf8");

  return {
    directory: resolved.directory,
    raw
  };
}

export async function saveRenderStyle(configRoot: string, directory: string, raw: string) {
  const resolved = resolveRenderStyleAbsolutePath(configRoot, directory);
  await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
  await fs.writeFile(resolved.absolutePath, raw, "utf8");

  return {
    directory: resolved.directory,
    raw
  };
}

export async function createRenderStyle(configRoot: string, fileName: string) {
  const resolved = resolveRenderStyleAbsolutePath(configRoot, fileName);

  await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });

  try {
    await fs.access(resolved.absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    await fs.writeFile(
      resolved.absolutePath,
      buildRenderStyleTemplate(resolved.directory),
      "utf8"
    );
  }

  const [style, renderConfig] = await Promise.all([
    readRenderStyle(configRoot, resolved.directory),
    ensureRenderStyleRegistered(configRoot, resolved.directory, { enable: true })
  ]);

  return {
    ...style,
    renderConfig
  };
}

export async function updateRenderStyleEnable(configRoot: string, directory: string, enable: boolean) {
  const resolved = resolveRenderStyleAbsolutePath(configRoot, directory);
  return ensureRenderStyleRegistered(configRoot, resolved.directory, { enable });
}
