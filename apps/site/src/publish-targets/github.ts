/**
 * GitHub Pages publish target.
 *
 * Takes the contents of `ctx.distDir` and force-pushes them to the configured
 * deploy repo / branch. Implementation lifted out of the original
 * `apps/site/src/publisher.ts` so it can sit behind the `PublishTarget`
 * interface alongside other targets (Cloudflare, etc.).
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { GithubTargetConfig, PublishContext, PublishResult, PublishTarget } from "./types.js";
import { PublishTargetError } from "./types.js";

const TARGET_ID = "github";
const DEFAULT_BRANCH = "main";

function normalizeGithubRepoPath(repoUrl: string) {
  if (repoUrl.startsWith("https://github.com/")) {
    return repoUrl.slice("https://github.com/".length);
  }
  const sshMatch = repoUrl.match(/^git@github\.com:(.+)$/);
  if (sshMatch) {
    return sshMatch[1];
  }
  throw new PublishTargetError(
    TARGET_ID,
    "validate",
    `Unsupported deploy repository URL: ${repoUrl}`
  );
}

function toHttpsRepoUrl(repoUrl: string) {
  return `https://github.com/${normalizeGithubRepoPath(repoUrl)}`;
}

function toAuthenticatedHttpsRepoUrl(repoUrl: string, authToken: string) {
  const repoPath = normalizeGithubRepoPath(repoUrl);
  const [owner] = repoPath.split("/");
  if (!owner) {
    throw new PublishTargetError(
      TARGET_ID,
      "validate",
      `Unable to infer GitHub owner from deploy repository URL: ${repoUrl}`
    );
  }
  return `https://${encodeURIComponent(owner)}:${encodeURIComponent(authToken)}@github.com/${repoPath}`;
}

function maskSecret(value: string, secret: string) {
  return secret ? value.split(secret).join("***") : value;
}

async function runGitCommand(
  args: string[],
  cwd: string,
  secretToMask: string,
  phase: string
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
    child.on("error", (error) =>
      reject(
        new PublishTargetError(TARGET_ID, phase, maskSecret(error.message, secretToMask), {
          cause: error
        })
      )
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolve(maskSecret(stdout, secretToMask));
        return;
      }
      const message = maskSecret(
        stderr || stdout || `git ${args.join(" ")} failed with code ${code}`,
        secretToMask
      );
      reject(new PublishTargetError(TARGET_ID, phase, message, { detail: message }));
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
  secretToMask: string,
  logger: (line: string) => void
) {
  await runGitCommand(["init"], worktreeDir, secretToMask, "git-init");
  await runGitCommand(["checkout", "-B", branch], worktreeDir, secretToMask, "git-checkout");
  await runGitCommand(["remote", "add", "origin", remoteUrl], worktreeDir, secretToMask, "git-remote");

  try {
    await runGitCommand(
      ["fetch", "--depth", "1", "origin", branch],
      worktreeDir,
      secretToMask,
      "git-fetch"
    );
    await runGitCommand(
      ["reset", "--hard", "FETCH_HEAD"],
      worktreeDir,
      secretToMask,
      "git-reset"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/couldn't find remote ref|not found|remote ref does not exist/i.test(message)) {
      logger(`[publish] github remote branch "${branch}" missing; will create on first push.`);
      return;
    }
    throw error;
  }
}

async function commitAndPush(
  worktreeDir: string,
  branch: string,
  secretToMask: string,
  config: GithubTargetConfig
): Promise<{ uploaded: number; skipped: number }> {
  await runGitCommand(["add", "-A"], worktreeDir, secretToMask, "git-add");
  const status = await runGitCommand(
    ["status", "--porcelain"],
    worktreeDir,
    secretToMask,
    "git-status"
  );

  if (!status.trim()) {
    return { uploaded: 0, skipped: 0 };
  }

  await runGitCommand(
    ["config", "user.name", config.userName ?? "blog-system"],
    worktreeDir,
    secretToMask,
    "git-config"
  );
  await runGitCommand(
    ["config", "user.email", config.userEmail ?? "blog-system@example.com"],
    worktreeDir,
    secretToMask,
    "git-config"
  );
  await runGitCommand(
    ["commit", "-m", "Deploy static site"],
    worktreeDir,
    secretToMask,
    "git-commit"
  );
  await runGitCommand(
    ["push", "-f", "origin", `HEAD:${branch}`],
    worktreeDir,
    secretToMask,
    "git-push"
  );
  // git is opaque about how many entries were uploaded. Lines in `status` is a
  // good-enough proxy for the SSE log output.
  const changed = status.trim().split(/\r?\n/).filter(Boolean).length;
  return { uploaded: changed, skipped: 0 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const githubTarget: PublishTarget<GithubTargetConfig> = {
  id: TARGET_ID,
  validateConfig(raw): GithubTargetConfig {
    if (!isObject(raw)) {
      throw new PublishTargetError(TARGET_ID, "validate", "GitHub publish config must be an object.");
    }
    const deployRepo = trimOrUndefined(raw.deployRepo);
    if (!deployRepo) {
      throw new PublishTargetError(
        TARGET_ID,
        "validate",
        '"deployRepo" is required for the GitHub publish target.'
      );
    }
    return {
      deployRepo,
      deployBranch: trimOrUndefined(raw.deployBranch) ?? DEFAULT_BRANCH,
      authToken: trimOrUndefined(raw.authToken),
      userName: trimOrUndefined(raw.userName),
      userEmail: trimOrUndefined(raw.userEmail),
      siteBasePath: trimOrUndefined(raw.siteBasePath) ?? ""
    };
  },
  async publish(cfg, ctx: PublishContext): Promise<PublishResult> {
    const startedAt = Date.now();
    const remoteUrl = cfg.authToken
      ? toAuthenticatedHttpsRepoUrl(cfg.deployRepo, cfg.authToken)
      : toHttpsRepoUrl(cfg.deployRepo);
    const httpsRepo = toHttpsRepoUrl(cfg.deployRepo);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-publish-"));
    ctx.logger(`[publish] github → ${httpsRepo}#${cfg.deployBranch}`);

    try {
      await ensureRemoteState(
        tempDir,
        remoteUrl,
        cfg.deployBranch,
        cfg.authToken ?? "",
        ctx.logger
      );
      await clearDirectoryExceptGit(tempDir);
      await copyBuildOutput(ctx.distDir, tempDir);
      await fs.writeFile(path.join(tempDir, ".nojekyll"), "", "utf8");

      const { uploaded, skipped } = await commitAndPush(
        tempDir,
        cfg.deployBranch,
        cfg.authToken ?? "",
        cfg
      );

      if (uploaded === 0) {
        ctx.logger("[publish] github: no changes to publish.");
      } else {
        ctx.logger(`[publish] github: pushed ${uploaded} changed entries.`);
      }

      return {
        url: httpsRepo,
        uploaded,
        skipped,
        durationMs: Date.now() - startedAt
      };
    } finally {
      // Best effort: leave temp dir on disk on Windows where rm sometimes races.
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignored — temp dir, OS will reclaim.
      }
    }
  }
};
