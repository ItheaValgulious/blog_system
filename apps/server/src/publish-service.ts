import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ServerSettings } from "./config.js";
import { PublishTargetError } from "../../site/src/publish-targets/types.js";

interface PublisherModule {
  publishSite(customSettings?: {
    assetsRoot?: string;
    configRoot?: string;
    contentRoot?: string;
    projectRoot?: string;
    workspaceRoot?: string;
  }): Promise<{
    target: string;
    message: string;
    url?: string;
    deploymentId?: string;
    uploaded: number;
    skipped: number;
    durationMs: number;
  }>;
}

export interface PublishServiceResult {
  stdout: string;
  stderr: string;
  target: string;
  url?: string;
  deploymentId?: string;
  uploaded: number;
  skipped: number;
  durationMs: number;
}

export interface PublishServiceError {
  message: string;
  target?: string;
  phase?: string;
  status?: number;
  detail?: string;
}

async function buildSiteRuntime(settings: ServerSettings) {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(settings.npmCommand, ["run", "build-runtime", "-w", "apps/site"], {
      cwd: settings.projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail = `${stdoutChunks.join("")}${stderrChunks.join("")}`.trim();
      reject(
        new PublishTargetError(
          "publish",
          "build-runtime",
          `Failed to rebuild apps/site runtime-dist before publishing (exit code: ${code ?? "unknown"}).`,
          detail ? { detail: detail.slice(-4000) } : undefined
        )
      );
    });
  });

  return {
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join("")
  };
}

export async function publishSite(settings: ServerSettings): Promise<PublishServiceResult> {
  const buildOutput = await buildSiteRuntime(settings);
  const publisherEntry = path.join(settings.projectRoot, "apps", "site", "runtime-dist", "publisher.js");
  const publisherUrl = pathToFileURL(publisherEntry);
  publisherUrl.searchParams.set("ts", `${Date.now()}`);
  const publisherModule = (await import(publisherUrl.href)) as PublisherModule;
  const result = await publisherModule.publishSite({
    assetsRoot: settings.assetsRoot,
    configRoot: settings.configRoot,
    contentRoot: settings.contentRoot,
    projectRoot: settings.projectRoot,
    workspaceRoot: settings.workspaceRoot
  });

  return {
    stderr: buildOutput.stderr,
    stdout: [buildOutput.stdout.trim(), result.message].filter(Boolean).join("\n"),
    target: result.target,
    url: result.url,
    deploymentId: result.deploymentId,
    uploaded: result.uploaded,
    skipped: result.skipped,
    durationMs: result.durationMs
  };
}
