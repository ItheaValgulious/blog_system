import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ServerSettings } from "./config.js";

export async function publishSite(settings: ServerSettings) {
  const publisherEntry = path.join(settings.projectRoot, "apps", "site", "runtime-dist", "publisher.js");
  const publisherModule = (await import(pathToFileURL(publisherEntry).href)) as {
    publishSite(customSettings?: {
      assetsRoot?: string;
      configRoot?: string;
      contentRoot?: string;
      projectRoot?: string;
      workspaceRoot?: string;
    }): Promise<string>;
  };
  const stdout = await publisherModule.publishSite({
    assetsRoot: settings.assetsRoot,
    configRoot: settings.configRoot,
    contentRoot: settings.contentRoot,
    projectRoot: settings.projectRoot,
    workspaceRoot: settings.workspaceRoot
  });

  return {
    stderr: "",
    stdout
  };
}
