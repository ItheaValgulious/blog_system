import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGitCommit, pushGitChanges } from "./git-service.js";

function runGit(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env,
      shell: false
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

test("pushGitChanges returns a no-op message when there are no commits", async () => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-git-empty-"));
  await runGit(["init"], repositoryRoot);
  await runGit(["branch", "-M", "main"], repositoryRoot);

  const result = await pushGitChanges(repositoryRoot);

  assert.equal(result.message, "No commits to push.");
});

test("pushGitChanges falls back to origin when upstream is missing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-git-push-"));
  const repositoryRoot = path.join(tempRoot, "repo");
  const remoteRoot = path.join(tempRoot, "remote.git");

  await fs.mkdir(repositoryRoot, { recursive: true });
  await runGit(["init", "--bare", remoteRoot], tempRoot);
  await runGit(["init"], repositoryRoot);
  await runGit(["branch", "-M", "main"], repositoryRoot);
  await fs.writeFile(path.join(repositoryRoot, "entry.txt"), "hello\n", "utf8");
  await createGitCommit(repositoryRoot, "Initial commit");
  await runGit(["remote", "add", "origin", remoteRoot], repositoryRoot);

  const result = await pushGitChanges(repositoryRoot);

  assert.equal(result.message, "Pushed changes successfully.");
  assert.match(
    (await runGit(["rev-parse", "--verify", "refs/heads/main"], remoteRoot)).trim(),
    /^[0-9a-f]{40}$/
  );
  assert.equal(
    (await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repositoryRoot)).trim(),
    "origin/main"
  );
});
