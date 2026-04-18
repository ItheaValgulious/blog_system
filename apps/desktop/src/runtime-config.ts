import { promises as fs } from "node:fs";
import path from "node:path";

export type DesktopServerMode = "local" | "remote";

export interface DesktopRuntimeConfig {
  adminPort: number;
  mode: DesktopServerMode;
  serverBaseUrl?: string;
  serverPort: number;
}

interface RuntimeConfigFile {
  adminPort?: number;
  mode?: DesktopServerMode;
  serverBaseUrl?: string;
  serverPort?: number;
}

interface LoadRuntimeConfigOptions {
  isPackaged: boolean;
  projectRoot: string;
  resourcesPath: string;
}

const DEFAULT_CONFIG: DesktopRuntimeConfig = {
  adminPort: 8788,
  mode: "local",
  serverPort: 8787
};

function parsePort(rawValue: number | string | undefined, fallback: number, label: string) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }

  return parsed;
}

function normalizeMode(rawValue: string | undefined, fallback: DesktopServerMode): DesktopServerMode {
  const value = rawValue?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "local" || value === "remote") {
    return value;
  }

  throw new Error(`Unsupported desktop mode "${rawValue}". Expected "local" or "remote".`);
}

function normalizeServerBaseUrl(rawValue: string | undefined) {
  const value = rawValue?.trim();

  if (!value) {
    return undefined;
  }

  const url = new URL(value);
  return url.toString().replace(/\/+$/, "");
}

async function readRuntimeConfigFile(configPath: string): Promise<RuntimeConfigFile> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as RuntimeConfigFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function loadDesktopRuntimeConfig(
  options: LoadRuntimeConfigOptions
): Promise<DesktopRuntimeConfig> {
  const configPath = options.isPackaged
    ? path.join(options.resourcesPath, "desktop.config.json")
    : path.join(options.projectRoot, "apps", "desktop", "desktop.config.json");
  const fileConfig = await readRuntimeConfigFile(configPath);

  const mode = normalizeMode(
    process.env.BLOG_SYSTEM_ELECTRON_MODE ?? fileConfig.mode,
    DEFAULT_CONFIG.mode
  );
  const adminPort = parsePort(
    process.env.BLOG_SYSTEM_ELECTRON_ADMIN_PORT ?? fileConfig.adminPort,
    DEFAULT_CONFIG.adminPort,
    "BLOG_SYSTEM_ELECTRON_ADMIN_PORT"
  );
  const serverPort = parsePort(
    process.env.BLOG_SYSTEM_ELECTRON_SERVER_PORT ?? fileConfig.serverPort,
    DEFAULT_CONFIG.serverPort,
    "BLOG_SYSTEM_ELECTRON_SERVER_PORT"
  );
  const serverBaseUrl = normalizeServerBaseUrl(
    process.env.BLOG_SYSTEM_ELECTRON_SERVER_BASE_URL ?? fileConfig.serverBaseUrl
  );

  if (mode === "remote" && !serverBaseUrl) {
    throw new Error("Remote desktop mode requires BLOG_SYSTEM_ELECTRON_SERVER_BASE_URL or desktop.config.json.");
  }

  return {
    adminPort,
    mode,
    serverBaseUrl,
    serverPort
  };
}
