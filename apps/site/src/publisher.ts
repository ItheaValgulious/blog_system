import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSite, getSiteSettings, type SiteBuildSettings } from "./generator.js";

const defaultBranch = "main";

export interface PublishConfig {
  authToken?: string;
  deployBranch?: string;
  deployRepo: string;
  siteBasePath?: string;
  userEmail?: string;
  userName?: string;
}

function inferBasePathFromRepo(repoUrl: string) {
  const match = repoUrl.match(/[:/]([^/:]+)\.git$/);
  return match?.[1] ? `/${match[1]}` : "";
}

function normalizeGithubRepoPath(repoUrl: string) {
  if (repoUrl.startsWith("https://github.com/")) {
    return repoUrl.slice("https://github.com/".length);
  }

  const sshMatch = repoUrl.match(/^git@github\.com:(.+)$/);

  if (sshMatch) {
    return sshMatch[1];
  }

  throw new Error(`Unsupported deploy repository URL: ${repoUrl}`);
}

function toHttpsRepoUrl(repoUrl: string) {
  return `https://github.com/${normalizeGithubRepoPath(repoUrl)}`;
}

function toAuthenticatedHttpsRepoUrl(repoUrl: string, authToken: string) {
  const repoPath = normalizeGithubRepoPath(repoUrl);
  const [owner] = repoPath.split("/");

  if (!owner) {
    throw new Error(`Unable to infer GitHub owner from deploy repository URL: ${repoUrl}`);
  }

  return `https://${encodeURIComponent(owner)}:${encodeURIComponent(authToken)}@github.com/${repoPath}`;
}

function maskSecret(value: string, secret: string) {
  return secret ? value.split(secret).join("***") : value;
}

async function readPublishConfig(publishConfigPath: string): Promise<PublishConfig> {
  const rawConfig = await fs.readFile(publishConfigPath, "utf8");
  const parsed = JSON.parse(rawConfig) as PublishConfig;

  if (!parsed.deployRepo?.trim()) {
    throw new Error(`"deployRepo" is required in ${publishConfigPath}.`);
  }

  return {
    ...parsed,
    authToken: parsed.authToken?.trim() || undefined,
    deployBranch: parsed.deployBranch?.trim() || defaultBranch,
    deployRepo: parsed.deployRepo.trim(),
    siteBasePath: parsed.siteBasePath?.trim() || undefined,
    userEmail: parsed.userEmail?.trim() || undefined,
    userName: parsed.userName?.trim() || undefined
  };
}

async function runGitCommand(
  args: string[],
  cwd: string,
  secretToMask: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      env: process.env
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(maskSecret(stdout, secretToMask));
        return;
      }

      reject(
        new Error(maskSecret(stderr || stdout || `git ${args.join(" ")} failed with code ${code}`, secretToMask))
      );
    });
  });
}

async function clearDirectoryExceptGit(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map((entry) => fs.rm(path.join(directory, entry.name), { recursive: true, force: true }))
  );
}

async function copyBuildOutput(sourceDir: string, targetDir: string) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true });
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function ensureRemoteState(
  worktreeDir: string,
  remoteUrl: string,
  branch: string,
  secretToMask: string
) {
  await runGitCommand(["init"], worktreeDir, secretToMask);
  await runGitCommand(["checkout", "-B", branch], worktreeDir, secretToMask);
  await runGitCommand(["remote", "add", "origin", remoteUrl], worktreeDir, secretToMask);

  try {
    await runGitCommand(["fetch", "--depth", "1", "origin", branch], worktreeDir, secretToMask);
    await runGitCommand(["reset", "--hard", "FETCH_HEAD"], worktreeDir, secretToMask);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/couldn't find remote ref|not found|remote ref does not exist/i.test(message)) {
      return;
    }

    throw error;
  }
}

async function commitAndPush(
  worktreeDir: string,
  branch: string,
  secretToMask: string,
  config: PublishConfig
) {
  await runGitCommand(["add", "-A"], worktreeDir, secretToMask);
  const status = await runGitCommand(["status", "--porcelain"], worktreeDir, secretToMask);

  if (!status.trim()) {
    return "No changes to publish.";
  }

  await runGitCommand(["config", "user.name", config.userName ?? "blog-system"], worktreeDir, secretToMask);
  await runGitCommand(
    ["config", "user.email", config.userEmail ?? "blog-system@example.com"],
    worktreeDir,
    secretToMask
  );
  await runGitCommand(["commit", "-m", "Deploy static site"], worktreeDir, secretToMask);
  await runGitCommand(["push", "-f", "origin", `HEAD:${branch}`], worktreeDir, secretToMask);
  return "Published static site successfully.";
}

export async function publishSite(customSettings?: Partial<SiteBuildSettings>) {
  const settings = {
    ...getSiteSettings(),
    ...customSettings
  };
  const publishConfigPath = path.join(settings.configRoot, "site-publish.local.json");
  const publishConfig = await readPublishConfig(publishConfigPath);
  const httpsRepo = toHttpsRepoUrl(publishConfig.deployRepo);
  const remoteUrl = publishConfig.authToken
    ? toAuthenticatedHttpsRepoUrl(publishConfig.deployRepo, publishConfig.authToken)
    : httpsRepo;
  const publishBasePath = publishConfig.siteBasePath ?? inferBasePathFromRepo(httpsRepo);
  const publishDistDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-publish-dist-"));
  const distDir = await buildSite({
    ...settings,
    basePath: publishBasePath,
    distDir: publishDistDir
  });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-publish-"));

  await ensureRemoteState(
    tempDir,
    remoteUrl,
    publishConfig.deployBranch ?? defaultBranch,
    publishConfig.authToken ?? ""
  );
  await clearDirectoryExceptGit(tempDir);
  await copyBuildOutput(distDir, tempDir);
  await fs.writeFile(path.join(tempDir, ".nojekyll"), "", "utf8");

  return commitAndPush(
    tempDir,
    publishConfig.deployBranch ?? defaultBranch,
    publishConfig.authToken ?? "",
    publishConfig
  );
}
