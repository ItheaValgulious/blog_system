import { spawn } from "node:child_process";

export interface GitChangedFile {
  path: string;
  status: string;
}

export interface GitCommitSummary {
  hash: string;
  message: string;
  timestamp: string;
}

function runGit(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
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
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || stdout || `git ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function isGitRepository(repositoryRoot: string) {
  try {
    await runGit(["rev-parse", "--show-toplevel"], repositoryRoot);
    return true;
  } catch {
    return false;
  }
}

export async function getGitStatus(repositoryRoot: string): Promise<GitChangedFile[]> {
  const stdout = await runGit(["status", "--porcelain"], repositoryRoot);

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3)
    }));
}

export async function getGitHistory(repositoryRoot: string): Promise<GitCommitSummary[]> {
  let stdout = "";

  try {
    stdout = await runGit(
      ["log", "--date=iso-strict", "--pretty=format:%H%x09%ad%x09%s"],
      repositoryRoot
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/does not have any commits yet|your current branch .* does not have any commits yet/i.test(message)) {
      return [];
    }

    throw error;
  }

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, timestamp, message] = line.split("\t");
      return {
        hash,
        message,
        timestamp
      };
    });
}

export async function createGitCommit(repositoryRoot: string, message: string) {
  await runGit(["add", "-A"], repositoryRoot);
  const status = await getGitStatus(repositoryRoot);

  if (status.length === 0) {
    return { message: "No changes to commit." };
  }

  await runGit(["config", "user.name", "blog-system"], repositoryRoot);
  await runGit(["config", "user.email", "blog-system@example.com"], repositoryRoot);
  await runGit(["commit", "-m", message], repositoryRoot);
  return { message: "Committed changes successfully." };
}

export async function ensureGitRepository(repositoryRoot: string) {
  if (await isGitRepository(repositoryRoot)) {
    return { initialized: true, message: "Git repository already initialized." };
  }

  await runGit(["init"], repositoryRoot);
  await runGit(["branch", "-M", "main"], repositoryRoot);
  return { initialized: true, message: "Initialized git repository." };
}

export async function getGitOverview(repositoryRoot: string) {
  const initialized = await isGitRepository(repositoryRoot);

  if (!initialized) {
    return {
      commits: [],
      files: [],
      initialized
    };
  }

  return {
    commits: await getGitHistory(repositoryRoot),
    files: await getGitStatus(repositoryRoot),
    initialized
  };
}
