import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { createNpmSpawnInvocation, resolvePublisherRuntime } from "./publish-service.js";

test("createNpmSpawnInvocation wraps npm.cmd with cmd.exe on Windows", () => {
  assert.deepEqual(
    createNpmSpawnInvocation("npm.cmd", ["run", "build-runtime", "-w", "apps/site"], "win32", "cmd.exe"),
    {
      args: ["/d", "/s", "/c", "npm.cmd run build-runtime -w apps/site"],
      command: "cmd.exe"
    }
  );
});

test("createNpmSpawnInvocation quotes full Windows npm paths with spaces", () => {
  assert.deepEqual(
    createNpmSpawnInvocation(
      "C:\\Program Files\\nodejs\\npm.cmd",
      ["run", "build-runtime", "-w", "apps/site"],
      "win32",
      "cmd.exe"
    ),
    {
      args: ["/d", "/s", "/c", '"C:\\Program Files\\nodejs\\npm.cmd" run build-runtime -w apps/site'],
      command: "cmd.exe"
    }
  );
});

test("resolvePublisherRuntime skips rebuild when only bundled runtime-dist is available", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-publish-service-"));

  try {
    const publisherEntry = path.join(tempRoot, "apps", "site", "runtime-dist", "publisher.js");
    await fs.mkdir(path.dirname(publisherEntry), { recursive: true });
    await fs.writeFile(publisherEntry, "export {};\n", "utf8");

    await assert.doesNotReject(async () => {
      const runtime = await resolvePublisherRuntime(tempRoot);
      assert.equal(runtime.publisherEntry, publisherEntry);
      assert.equal(runtime.shouldBuildRuntime, false);
    });
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});

test("resolvePublisherRuntime rebuilds when the site workspace exists", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-publish-service-"));

  try {
    const sitePackagePath = path.join(tempRoot, "apps", "site", "package.json");
    const publisherEntry = path.join(tempRoot, "apps", "site", "runtime-dist", "publisher.js");

    await fs.mkdir(path.dirname(sitePackagePath), { recursive: true });
    await fs.mkdir(path.dirname(publisherEntry), { recursive: true });
    await fs.writeFile(sitePackagePath, "{\n  \"name\": \"@blog-system/site\"\n}\n", "utf8");
    await fs.writeFile(publisherEntry, "export {};\n", "utf8");

    const runtime = await resolvePublisherRuntime(tempRoot);
    assert.equal(runtime.publisherEntry, publisherEntry);
    assert.equal(runtime.shouldBuildRuntime, true);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});
