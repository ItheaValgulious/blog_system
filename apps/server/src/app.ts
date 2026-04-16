import { promises as fs } from "node:fs";
import path from "node:path";

import cors from "cors";
import express from "express";
import session from "express-session";

import { readArticle } from "@blog-system/content-core/node";

import type { ServerSettings } from "./config.js";
import { listMediaAssets, savePastedImages } from "./asset-service.js";
import { getDefaultSettings } from "./config.js";
import {
  createArticleFile,
  createFileSystemEntry,
  deleteFileSystemEntry,
  ensureContentRoot,
  getTreePayload,
  renameFileSystemEntry,
  readFileSystemMetadata,
  saveArticleContent,
  saveFileSystemMetadata,
  transferFileSystemEntry,
  updateArticleStatus
} from "./content-service.js";
import {
  loadEditorConfig,
  saveEditorConfig,
  validateEditorConfigPayload
} from "./editor-config-service.js";
import { createGitCommit, ensureGitRepository, getGitHistory, getGitOverview, getGitStatus } from "./git-service.js";
import { publishSite } from "./publish-service.js";
import {
  createRenderStyle,
  getRenderStylesRoot,
  loadRenderConfig,
  readRenderStyle,
  saveRenderConfig,
  saveRenderStyle
} from "./render-config-service.js";
import { loadSiteConfig, saveSiteConfig } from "./site-config-service.js";
import { loadSiteThemeConfig, saveSiteThemeConfig } from "./site-theme-config-service.js";

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.isAuthenticated) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  next();
}

export function createApp(customSettings?: Partial<ServerSettings>) {
  const settings = {
    ...getDefaultSettings(),
    ...customSettings
  };

  const app = express();
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true
    })
  );
  app.use(express.json({ limit: "25mb" }));
  app.use(
    session({
      secret: settings.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax"
      }
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (username !== settings.adminUsername || password !== settings.adminPassword) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    req.session.isAuthenticated = true;
    res.json({ ok: true, username: settings.adminUsername });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.use("/api", requireAuth);

  app.get("/api/tree", async (_req, res, next) => {
    try {
      await ensureContentRoot(settings.contentRoot);
      res.json(await getTreePayload(settings.contentRoot));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/article", async (req, res, next) => {
    try {
      const relativePath = String(req.query.path ?? "");
      res.json(await readArticle(settings.contentRoot, relativePath));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/article", async (req, res, next) => {
    try {
      const { path: relativePath, rawContent } = req.body as {
        path?: string;
        rawContent?: string;
      };

      if (!relativePath || typeof rawContent !== "string") {
        res.status(400).json({ error: "Both path and rawContent are required." });
        return;
      }

      res.json(await saveArticleContent(settings.contentRoot, relativePath, rawContent));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/article/new", async (req, res, next) => {
    try {
      const { directoryPath = "", fileName } = req.body as {
        directoryPath?: string;
        fileName?: string;
      };

      if (!fileName) {
        res.status(400).json({ error: "fileName is required." });
        return;
      }

      res.json(await createArticleFile(settings.contentRoot, directoryPath, fileName));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/article/status", async (req, res, next) => {
    try {
      const { path: relativePath, status } = req.body as {
        path?: string;
        status?: "draft" | "published";
      };

      if (!relativePath || (status !== "draft" && status !== "published")) {
        res.status(400).json({ error: "Valid path and status are required." });
        return;
      }

      res.json(await updateArticleStatus(settings.contentRoot, relativePath, status));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tags", async (_req, res, next) => {
    try {
      const payload = await getTreePayload(settings.contentRoot);
      res.json(payload.tags);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/editor-config", async (_req, res, next) => {
    try {
      const config = await loadEditorConfig(settings.editorConfigDir);
      const validation = validateEditorConfigPayload(
        config.markdownSnippets,
        config.latexSnippets,
        config.keybindings
      );
      res.json({
        ...config,
        warnings: validation.warnings
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/editor-config", async (req, res, next) => {
    try {
      const { markdownSnippetsRaw, latexSnippetsRaw, keybindingsRaw } = req.body as {
        markdownSnippetsRaw?: string;
        latexSnippetsRaw?: string;
        keybindingsRaw?: string;
      };

      if (
        typeof markdownSnippetsRaw !== "string" ||
        typeof latexSnippetsRaw !== "string" ||
        typeof keybindingsRaw !== "string"
      ) {
        res.status(400).json({
          error: "markdownSnippetsRaw, latexSnippetsRaw, and keybindingsRaw are required."
        });
        return;
      }

      res.json(
        await saveEditorConfig(
          settings.editorConfigDir,
          markdownSnippetsRaw,
          latexSnippetsRaw,
          keybindingsRaw
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/site-config", async (_req, res, next) => {
    try {
      const config = await loadSiteConfig(settings.configRoot);
      res.json({
        raw: config.raw,
        value: config.value
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/site-config", async (req, res, next) => {
    try {
      const { raw } = req.body as { raw?: string };

      if (typeof raw !== "string") {
        res.status(400).json({ error: "raw is required." });
        return;
      }

      res.json(await saveSiteConfig(settings.configRoot, raw));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/site-theme-config", async (req, res, next) => {
    try {
      const themeId = String(req.query.theme ?? "atlas");
      const config = await loadSiteThemeConfig(settings.configRoot, themeId);
      res.json({
        raw: config.raw,
        themeId,
        value: config.value
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/site-theme-config", async (req, res, next) => {
    try {
      const { raw, themeId = "atlas" } = req.body as { raw?: string; themeId?: string };

      if (typeof raw !== "string") {
        res.status(400).json({ error: "raw is required." });
        return;
      }

      res.json(await saveSiteThemeConfig(settings.configRoot, themeId, raw));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/render-config", async (_req, res, next) => {
    try {
      const config = await loadRenderConfig(settings.configRoot);
      res.json({
        raw: config.raw,
        value: config.value
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/render-config", async (req, res, next) => {
    try {
      const { raw } = req.body as { raw?: string };

      if (typeof raw !== "string") {
        res.status(400).json({ error: "raw is required." });
        return;
      }

      res.json(await saveRenderConfig(settings.configRoot, raw));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/render-style", async (req, res, next) => {
    try {
      const directory = String(req.query.directory ?? "");

      if (!directory) {
        res.status(400).json({ error: "directory is required." });
        return;
      }

      res.json(await readRenderStyle(settings.configRoot, directory));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/render-style", async (req, res, next) => {
    try {
      const { directory, raw } = req.body as { directory?: string; raw?: string };

      if (!directory || typeof raw !== "string") {
        res.status(400).json({ error: "directory and raw are required." });
        return;
      }

      res.json(await saveRenderStyle(settings.configRoot, directory, raw));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/render-style/create", async (req, res, next) => {
    try {
      const { fileName } = req.body as { fileName?: string };

      if (!fileName?.trim()) {
        res.status(400).json({ error: "fileName is required." });
        return;
      }

      res.json(await createRenderStyle(settings.configRoot, fileName));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/create", async (req, res, next) => {
    try {
      const { parentPath = "", entryType, name, metadata } = req.body as {
        parentPath?: string;
        entryType?: "file" | "directory";
        name?: string;
        metadata?: Record<string, unknown>;
      };

      if ((entryType !== "file" && entryType !== "directory") || !name?.trim()) {
        res.status(400).json({ error: "Valid parentPath, entryType, and name are required." });
        return;
      }

      res.json(await createFileSystemEntry(settings.contentRoot, parentPath, entryType, name, metadata));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/rename", async (req, res, next) => {
    try {
      const { path: relativePath, nextName } = req.body as {
        path?: string;
        nextName?: string;
      };

      if (!relativePath || !nextName?.trim()) {
        res.status(400).json({ error: "path and nextName are required." });
        return;
      }

      res.json(await renameFileSystemEntry(settings.contentRoot, relativePath, nextName));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/fs/metadata", async (req, res, next) => {
    try {
      const relativePath = String(req.query.path ?? "");

      if (!relativePath) {
        res.status(400).json({ error: "path is required." });
        return;
      }

      res.json(await readFileSystemMetadata(settings.contentRoot, relativePath));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/metadata", async (req, res, next) => {
    try {
      const { path: relativePath, metadata } = req.body as {
        path?: string;
        metadata?: Record<string, unknown>;
      };

      if (!relativePath || !metadata || typeof metadata !== "object") {
        res.status(400).json({ error: "path and metadata are required." });
        return;
      }

      res.json(await saveFileSystemMetadata(settings.contentRoot, relativePath, metadata));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/delete", async (req, res, next) => {
    try {
      const { path: relativePath } = req.body as {
        path?: string;
      };

      if (!relativePath) {
        res.status(400).json({ error: "path is required." });
        return;
      }

      await deleteFileSystemEntry(settings.contentRoot, relativePath);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/transfer", async (req, res, next) => {
    try {
      const { sourcePath, targetDirectoryPath, mode } = req.body as {
        sourcePath?: string;
        targetDirectoryPath?: string;
        mode?: "copy" | "move";
      };

      if (!sourcePath || typeof targetDirectoryPath !== "string" || (mode !== "copy" && mode !== "move")) {
        res.status(400).json({ error: "sourcePath, targetDirectoryPath, and mode are required." });
        return;
      }

      res.json(
        await transferFileSystemEntry(settings.contentRoot, sourcePath, targetDirectoryPath, mode)
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/assets/paste-image", async (req, res, next) => {
    try {
      const { articlePath, images } = req.body as {
        articlePath?: string;
        images?: Array<{
          mimeType?: string;
          base64Data?: string;
          fileName?: string;
        }>;
      };

      if (!articlePath || !Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: "articlePath and at least one image are required." });
        return;
      }

      const invalidImage = images.find(
        (image) =>
          typeof image.mimeType !== "string" ||
          !image.mimeType.startsWith("image/") ||
          typeof image.base64Data !== "string" ||
          image.base64Data.length === 0
      );

      if (invalidImage) {
        res.status(400).json({ error: "Each pasted image must include mimeType and base64Data." });
        return;
      }

      const savedAssets = await savePastedImages(
        settings.assetsRoot,
        images as Array<{ mimeType: string; base64Data: string; fileName?: string }>
      );

      res.json({ assets: savedAssets });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/media", async (_req, res, next) => {
    try {
      res.json({
        assets: await listMediaAssets(settings.assetsRoot)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/media", async (req, res, next) => {
    try {
      const { images } = req.body as {
        images?: Array<{
          mimeType?: string;
          base64Data?: string;
          fileName?: string;
        }>;
      };

      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: "At least one image is required." });
        return;
      }

      const invalidImage = images.find(
        (image) =>
          typeof image.mimeType !== "string" ||
          !image.mimeType.startsWith("image/") ||
          typeof image.base64Data !== "string" ||
          image.base64Data.length === 0
      );

      if (invalidImage) {
        res.status(400).json({ error: "Each image must include mimeType and base64Data." });
        return;
      }

      const assets = await savePastedImages(
        settings.assetsRoot,
        images as Array<{ mimeType: string; base64Data: string; fileName?: string }>
      );
      res.json({ assets });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/publish", async (_req, res, next) => {
    try {
      res.json(await publishSite(settings));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/git/status", async (_req, res, next) => {
    try {
      const overview = await getGitOverview(settings.workspaceRoot);
      res.json({
        files: overview.files,
        initialized: overview.initialized
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/git/history", async (_req, res, next) => {
    try {
      const overview = await getGitOverview(settings.workspaceRoot);
      res.json({
        commits: overview.commits,
        initialized: overview.initialized
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/git/commit", async (req, res, next) => {
    try {
      const { message } = req.body as { message?: string };

      if (!message?.trim()) {
        res.status(400).json({ error: "message is required." });
        return;
      }

      res.json(await createGitCommit(settings.workspaceRoot, message.trim()));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/git/init", async (_req, res, next) => {
    try {
      res.json(await ensureGitRepository(settings.workspaceRoot));
    } catch (error) {
      next(error);
    }
  });

  app.use("/content-files", express.static(settings.contentRoot));
  app.use("/media", express.static(settings.assetsRoot));
  app.use("/render-files", express.static(getRenderStylesRoot(settings.configRoot)));

  app.get("/admin/*splat", async (_req, res, next) => {
    try {
      const indexPath = path.join(settings.adminDistDir, "index.html");
      await fs.access(indexPath);
      res.sendFile(indexPath);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    res.status(500).json({ error: message });
  });

  return app;
}
