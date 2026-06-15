/**
 * Registry of publish targets.
 *
 * Targets self-register at module load time (see the bottom of this file) so
 * that `publishSite()` can resolve `defaultTarget` without knowing the concrete
 * implementations. New targets only need to be imported and registered here.
 */

import { cloudflareTarget } from "./cloudflare.js";
import { githubTarget } from "./github.js";
import type { PublishTarget } from "./types.js";

const REGISTRY = new Map<string, PublishTarget<unknown>>();

export function registerTarget<C>(target: PublishTarget<C>): void {
  REGISTRY.set(target.id, target as PublishTarget<unknown>);
}

export function getTarget(id: string): PublishTarget<unknown> {
  const target = REGISTRY.get(id);
  if (!target) {
    throw new Error(
      `Unknown publish target "${id}". Registered: ${listTargets().join(", ") || "<none>"}`
    );
  }
  return target;
}

export function hasTarget(id: string): boolean {
  return REGISTRY.has(id);
}

export function listTargets(): string[] {
  return [...REGISTRY.keys()];
}

/** Test-only: clear the registry for hermetic re-population. */
export function _resetRegistryForTests(): void {
  REGISTRY.clear();
}

registerTarget(githubTarget);
registerTarget(cloudflareTarget);

export type { PublishTarget } from "./types.js";
