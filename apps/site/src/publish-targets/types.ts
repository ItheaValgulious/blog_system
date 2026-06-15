/**
 * Shared types for the pluggable publish-target registry.
 *
 * Each `PublishTarget` knows how to take an already-built static-site directory
 * and ship it to its destination (GitHub Pages, Cloudflare Pages, ...). Targets
 * receive a `PublishContext` describing the build output and a logger; they
 * return a `PublishResult` for the SSE log + downstream UI.
 */

export interface PublishContext {
  /** Absolute path to `buildSite()`'s output directory. */
  distDir: string;
  workspaceRoot: string;
  /** URL prefix for generated assets, mirrored into the build itself. */
  siteBasePath: string;
  /** Streamed back to admin via SSE. */
  logger: (line: string) => void;
}

export interface PublishResult {
  /** Public URL of the deployment, when known. */
  url?: string;
  /** Provider-specific deployment identifier, when known. */
  deploymentId?: string;
  uploaded: number;
  skipped: number;
  durationMs: number;
}

export interface PublishTarget<C = unknown> {
  /** Stable identifier matching the `defaultTarget` field in publish config. */
  id: string;
  /** Throws when the raw config is malformed; returns the parsed config otherwise. */
  validateConfig(raw: unknown): C;
  publish(cfg: C, ctx: PublishContext): Promise<PublishResult>;
}

export interface GithubTargetConfig {
  deployRepo: string;
  deployBranch: string;
  authToken?: string;
  userName?: string;
  userEmail?: string;
  siteBasePath: string;
}

export interface CloudflareTargetConfig {
  accountId: string;
  projectName: string;
  apiToken: string;
  branch: string;
  siteBasePath: string;
}

export interface PublishConfig {
  defaultTarget: "github" | "cloudflare";
  targets: Partial<{
    github: GithubTargetConfig;
    cloudflare: CloudflareTargetConfig;
  }>;
}

/**
 * Raised by targets to surface phase + provider info to admin.
 *
 * `phase` is a short human-readable string ("create-deployment",
 * "upload-assets", "git-push", ...). The server side wraps this into the
 * `/api/publish` JSON response so the UI can show
 * `Publish failed (cloudflare/upload-assets): ...`.
 */
export class PublishTargetError extends Error {
  readonly target: string;
  readonly phase: string;
  readonly status?: number;
  readonly detail?: string;

  constructor(
    target: string,
    phase: string,
    message: string,
    options: { status?: number; detail?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "PublishTargetError";
    this.target = target;
    this.phase = phase;
    this.status = options.status;
    this.detail = options.detail;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}
