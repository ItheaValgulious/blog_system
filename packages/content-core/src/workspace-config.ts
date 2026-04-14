import { readFileSync } from "node:fs";
import path from "node:path";

export interface WorkspaceConfigFile {
  workspace: string;
}

export interface WorkspacePaths {
  assetsRoot: string;
  codeRoot: string;
  configRoot: string;
  contentRoot: string;
  editorConfigDir: string;
  workspaceConfigPath: string;
  workspaceRoot: string;
}

export function loadWorkspacePaths(codeRoot: string): WorkspacePaths {
  const workspaceConfigPath = path.join(codeRoot, "config.json");
  const rawConfig = readFileSync(workspaceConfigPath, "utf8");
  const parsed = JSON.parse(rawConfig) as Partial<WorkspaceConfigFile>;
  const workspaceValue = parsed.workspace?.trim();

  if (!workspaceValue) {
    throw new Error(`"workspace" is required in ${workspaceConfigPath}.`);
  }

  const workspaceRoot = path.resolve(codeRoot, workspaceValue);

  return {
    assetsRoot: path.join(workspaceRoot, "assets"),
    codeRoot,
    configRoot: path.join(workspaceRoot, "config"),
    contentRoot: path.join(workspaceRoot, "content"),
    editorConfigDir: path.join(workspaceRoot, "config", "editor"),
    workspaceConfigPath,
    workspaceRoot
  };
}
