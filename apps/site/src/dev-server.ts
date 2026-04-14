import express from "express";
import chokidar from "chokidar";

import { buildSite, getSiteSettings } from "./generator.js";

const settings = getSiteSettings();
const app = express();
const port = Number(process.env.SITE_PORT ?? 4173);

await buildSite(settings);

app.use(express.static(settings.distDir));
app.use((_req, res) => {
  res.sendFile("404.html", { root: settings.distDir });
});

const watcher = chokidar.watch([settings.contentRoot, settings.assetsRoot, settings.configRoot], {
  ignoreInitial: true
});

let pendingBuild: Promise<unknown> | null = null;

watcher.on("all", () => {
  if (pendingBuild) {
    return;
  }

  pendingBuild = buildSite(settings)
    .then(() => {
      console.log("Static site rebuilt after content change.");
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      pendingBuild = null;
    });
});

app.listen(port, () => {
  console.log(`Static site preview on http://localhost:${port}`);
});
