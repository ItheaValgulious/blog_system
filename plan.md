# Blog System Summary

## 1. Overview

This project is a TypeScript monorepo for a local Markdown knowledge base and static site workflow.

- `apps/admin` is the admin workbench.
- `apps/server` is the local API server.
- `apps/site` is the static site generator and preview server.
- `packages/content-core` is the shared content, Markdown, frontmatter, and tree logic.

The code repository and the real content workspace are now separated.

- Code root: `C:\Projects\blog_system`
- Workspace root: configured by [config.json](/C:/Projects/blog_system/config.json)
- Current workspace path: `C:\Projects\blog_workspace`

The code root only stores application code and the root `config.json`.
The real user data lives under the workspace root.

## 2. Workspace Layout

All runtime data paths are derived from the single `workspace` field in [config.json](/C:/Projects/blog_system/config.json).
Nothing in the runtime now assumes that `assets`, `config`, or `content` live under the code repository root.

Current workspace structure:

- `C:\Projects\blog_workspace\content`
  - Markdown articles and folder metadata.
- `C:\Projects\blog_workspace\assets`
  - Unified media library.
- `C:\Projects\blog_workspace\config`
  - Site config, theme config, editor config, and local publish config.

Important config files now live in the workspace:

- [site.json](/C:/Projects/blog_workspace/config/site.json)
- [site-theme.atlas.json](/C:/Projects/blog_workspace/config/site-theme.atlas.json)
- [site-publish.local.json](/C:/Projects/blog_workspace/config/site-publish.local.json)
- [markdown.snippets.json](/C:/Projects/blog_workspace/config/editor/markdown.snippets.json)
- [latex.snippets.json](/C:/Projects/blog_workspace/config/editor/latex.snippets.json)
- [keybindings.json](/C:/Projects/blog_workspace/config/editor/keybindings.json)

## 3. Content Model

Articles are stored as Markdown files with YAML frontmatter.
The current canonical frontmatter model is:

- `title: string`
- `tags: string[]`
- `status: "draft" | "published"`
- `top: number`
- `date?: string`

Notes:

- `state` has been removed. Only `status` is used.
- `summary` has been removed from templates and normalization.
- `top` defaults to `0`.
- Sorting is `top` descending first, then `date` descending.
- Folder metadata is stored in hidden `.blog-system-folder.json` files and can contribute tags to descendant articles.

## 4. Admin Workbench

The admin app is a Monaco-based workbench for editing content and configuration.

Current capabilities:

- Explorer, search, plugin management, media library, git, and command tabs.
- Markdown and LaTeX snippets are configured separately.
- In Markdown, content inside `$...$` and `$$...$$` uses LaTeX snippets instead of Markdown snippets.
- Snippet trigger panes now work with special-character prefixes.
- Editor preview is incremental instead of full replacement.
- Preview uses debounce, block-level patching, and cursor-to-preview scroll sync.
- Invalid YAML frontmatter no longer blocks body preview rendering.
- Saving preserves cursor selection and scroll position instead of jumping back to the first line.
- Left sidebar width and right preview width are resizable and persisted.
- The file tree fills the sidebar height.
- File creation and rename support metadata extensions contributed by plugins.
- New article creation uses one `Title` input. The file name is derived by replacing spaces with `-` and appending `.md`.
- File tree supports context menu operations, drag and drop, and keyboard actions.

Current built-in admin-side feature plugins include:

- Theme switching command integration.
- Create metadata fields such as `Tags`.
- Frontmatter `Top` field editing.
- Media library tab.
- Git tab.

## 5. Media Library

Images now use a unified workspace media library instead of per-article sibling `assets` folders.

Behavior:

- Uploaded and pasted images are stored under `C:\Projects\blog_workspace\assets`.
- File names are content-hash based.
- Duplicate binary content is deduplicated by hash.
- Markdown references use `@media/<hash>.<ext>`.
- Admin preview rewrites `@media/...` to `/media/...`.
- Static site generation copies the workspace media library into `dist/media`.
- The site config and theme config can also reference images using `@media/...`.

The media library tab in admin supports browsing and uploading media assets.

## 6. Git Integration

The git plugin no longer points at the code repository.
It now manages the workspace repository root instead.

Current behavior:

- Git root is the configured workspace directory.
- Status, history, init, and commit all run inside the workspace directory.
- The plugin is no longer hardcoded to only inspect `content` and `assets`.
- Since the workspace contains `assets`, `config`, and `content`, the workspace repo naturally covers all user data.

During validation, the workspace repository was initialized successfully at:

- `C:\Projects\blog_workspace\.git`

## 7. Static Site Architecture

The static site has been refactored toward a plugin-driven structure.

Current site-side extension model includes:

- Theme plugins.
- Page plugins.
- Data plugins.

Current page-level features are implemented as plugins:

- Home page.
- Article pages.
- Tags page.
- Tree page.
- About page.
- Search page.

Current data-level features include:

- `top-order` sorting logic.

Theme and site behavior are configured from JSON:

- Site behavior from [site.json](/C:/Projects/blog_workspace/config/site.json)
- Theme colors from [site-theme.atlas.json](/C:/Projects/blog_workspace/config/site-theme.atlas.json)

Site header behavior currently follows these rules:

- Home page uses centered navigation without a title in the top bar.
- Non-home pages show only the main title, without a subtitle.

Background images are configurable from site config and use stretched rendering rather than tiled repetition.

## 8. Server and API

The server is responsible for auth, file operations, media handling, config persistence, git operations, and publish execution.

Key API groups:

- Auth: login and logout.
- Content tree and article load/save.
- Status switching.
- File system create, rename, delete, copy, move, and metadata.
- Editor config load and save.
- Site config and theme config load and save.
- Media upload and listing.
- Git status, history, init, and commit.
- Static site publish.

The server now derives `contentRoot`, `assetsRoot`, `configRoot`, `editorConfigDir`, and `workspaceRoot` from the root `config.json`.

## 9. Publish Flow

Publishing is still executed from the code repository because that is where the application code and npm workspaces live.
However, all publish inputs now come from the workspace.

Current publish behavior:

- Site content is read from workspace `content`.
- Site config and theme config are read from workspace `config`.
- Media is copied from workspace `assets`.
- Publish credentials and deploy target are read from workspace [site-publish.local.json](/C:/Projects/blog_workspace/config/site-publish.local.json).
- If `authToken` is present, publish uses token-authenticated HTTPS remote construction.

## 10. Validation Status

The current state has been validated with real runtime checks.

Completed validation:

- `npm run build` passed.
- `npm run publish-site` passed after the workspace migration.
- `npm run dev` started successfully for admin, server, and site.
- Playwright validation confirmed:
  - Admin can still log in.
  - Explorer reads the workspace content tree.
  - Git tab shows `Init Repository` before initialization.
  - Clicking `Init Repository` creates `.git` under the workspace root.
  - Publish from the admin UI returns `200` without error.

## 11. Current Implementation Notes

- The code repository is now application code only.
- User-managed data is now workspace data only.
- If the workspace path changes later, only [config.json](/C:/Projects/blog_system/config.json) needs to be updated.
- Any future path-sensitive feature should derive paths from the workspace setting instead of assuming repository-relative folders.
