import type {
  AdminHomeConfig,
  ArticleRecord,
  ContentTreeNode,
  EditorKeybinding,
  EditorSnippet,
  FileSystemNode,
  MarkdownBlockConfig,
  ThemeGroupConfig,
  ThemeGroupSummary,
  TagInfo
} from "@blog-system/content-core";

export class ApiRequestError extends Error {
  readonly code?: string;
  readonly conflicts?: Array<{ path: string; title: string }>;
  readonly status: number;

  constructor(
    status: number,
    payload: { code?: string; conflicts?: Array<{ path: string; title: string }>; error?: string } | null
  ) {
    super(payload?.error ?? `Request failed with ${status}`);
    this.status = status;
    this.code = payload?.code;
    this.conflicts = payload?.conflicts;
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      conflicts?: Array<{ path: string; title: string }>;
      error?: string;
    } | null;
    throw new ApiRequestError(response.status, payload);
  }

  return (await response.json()) as T;
}

export interface TreePayload {
  articles: Array<{
    path: string;
    directory: string;
    fileName: string;
    title: string;
    slug: string;
    status: "draft" | "published";
    date?: string;
    summary?: string;
    tags: string[];
    excerpt: string;
    urlPath: string;
  }>;
  tree: ContentTreeNode[];
  fileTree: FileSystemNode[];
  tags: TagInfo[];
}

export interface EditorConfigPayload {
  markdownSnippets: EditorSnippet[];
  latexSnippets: EditorSnippet[];
  keybindings: EditorKeybinding[];
  markdownSnippetsRaw: string;
  latexSnippetsRaw: string;
  keybindingsRaw: string;
  warnings: string[];
}

export interface SiteConfigPayload {
  raw: string;
  value: Record<string, unknown>;
}

export interface MarkdownBlockConfigPayload {
  raw: string;
  value: MarkdownBlockConfig;
}

export interface ThemeGroupsPayload {
  groups: ThemeGroupSummary[];
}

export interface ThemeGroupPayload {
  groupId: string;
  raw: string;
  value: ThemeGroupConfig;
}

export interface ThemeAssetPayload {
  adminPreview: boolean;
  assetPath: string;
  fileName: string;
  groupId: string;
  language: "css" | "javascript";
  raw: string;
  type: "css" | "js";
}

export interface AdminHomeConfigPayload {
  raw: string;
  value: AdminHomeConfig;
}

export interface ClipboardAssetPayload {
  fileName: string;
  relativePath: string;
  markdownPath: string;
}

export interface MediaAssetPayload {
  fileName: string;
  mimeType: string;
  relativePath: string;
  size: number;
  urlPath: string;
}

export interface GitChangedFilePayload {
  path: string;
  status: string;
}

export interface GitCommitPayload {
  hash: string;
  message: string;
  timestamp: string;
}

export interface FileSystemMetadataPayload {
  metadata: Record<string, unknown>;
  type: "directory" | "file";
}

export const api = {
  login(username: string, password: string) {
    return request<{ ok: true; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  logout() {
    return request<{ ok: true }>("/api/auth/logout", {
      method: "POST"
    });
  },
  getTree() {
    return request<TreePayload>("/api/tree");
  },
  getArticle(articlePath: string) {
    return request<ArticleRecord>(`/api/article?path=${encodeURIComponent(articlePath)}`);
  },
  saveArticle(articlePath: string, rawContent: string) {
    return request<ArticleRecord>("/api/article", {
      method: "PUT",
      body: JSON.stringify({
        path: articlePath,
        rawContent
      })
    });
  },
  updateStatus(articlePath: string, status: "draft" | "published") {
    return request<ArticleRecord>("/api/article/status", {
      method: "POST",
      body: JSON.stringify({
        path: articlePath,
        status
      })
    });
  },
  getEditorConfig() {
    return request<EditorConfigPayload>("/api/editor-config");
  },
  saveEditorConfig(
    markdownSnippetsRaw: string,
    latexSnippetsRaw: string,
    keybindingsRaw: string
  ) {
    return request<EditorConfigPayload>("/api/editor-config", {
      method: "PUT",
      body: JSON.stringify({
        markdownSnippetsRaw,
        latexSnippetsRaw,
        keybindingsRaw
      })
    });
  },
  getSiteConfig() {
    return request<SiteConfigPayload>("/api/site-config");
  },
  saveSiteConfig(raw: string) {
    return request<SiteConfigPayload>("/api/site-config", {
      method: "PUT",
      body: JSON.stringify({ raw })
    });
  },
  getMarkdownBlockConfig() {
    return request<MarkdownBlockConfigPayload>("/api/markdown-block-config");
  },
  saveMarkdownBlockConfig(raw: string) {
    return request<MarkdownBlockConfigPayload>("/api/markdown-block-config", {
      method: "PUT",
      body: JSON.stringify({ raw })
    });
  },
  getAdminHomeConfig() {
    return request<AdminHomeConfigPayload>("/api/admin-home-config");
  },
  saveAdminHomeConfig(raw: string) {
    return request<AdminHomeConfigPayload>("/api/admin-home-config", {
      method: "PUT",
      body: JSON.stringify({ raw })
    });
  },
  listThemeGroups() {
    return request<ThemeGroupsPayload>("/api/theme-groups");
  },
  getThemeGroup(groupId: string) {
    return request<ThemeGroupPayload>(`/api/theme-group?group=${encodeURIComponent(groupId)}`);
  },
  saveThemeGroup(groupId: string, raw: string) {
    return request<ThemeGroupPayload>("/api/theme-group", {
      method: "PUT",
      body: JSON.stringify({ groupId, raw })
    });
  },
  createThemeGroup(groupId: string) {
    return request<ThemeGroupPayload>("/api/theme-group/create", {
      method: "POST",
      body: JSON.stringify({ groupId })
    });
  },
  renameThemeGroup(groupId: string, nextGroupId: string) {
    return request<ThemeGroupPayload>("/api/theme-group/rename", {
      method: "POST",
      body: JSON.stringify({ groupId, nextGroupId })
    });
  },
  deleteThemeGroup(groupId: string) {
    return request<{ groupId: string }>("/api/theme-group/delete", {
      method: "POST",
      body: JSON.stringify({ groupId })
    });
  },
  getThemeAsset(groupId: string, fileName: string) {
    return request<ThemeAssetPayload>(
      `/api/theme-asset?group=${encodeURIComponent(groupId)}&file=${encodeURIComponent(fileName)}`
    );
  },
  saveThemeAsset(groupId: string, fileName: string, raw: string) {
    return request<ThemeAssetPayload>("/api/theme-asset", {
      method: "PUT",
      body: JSON.stringify({ groupId, fileName, raw })
    });
  },
  createThemeAsset(groupId: string, fileName: string, type: "css" | "js", adminPreview: boolean) {
    return request<ThemeAssetPayload>("/api/theme-asset/create", {
      method: "POST",
      body: JSON.stringify({ groupId, fileName, type, adminPreview })
    });
  },
  renameThemeAsset(groupId: string, fileName: string, nextFileName: string) {
    return request<ThemeAssetPayload>("/api/theme-asset/rename", {
      method: "POST",
      body: JSON.stringify({ groupId, fileName, nextFileName })
    });
  },
  deleteThemeAsset(groupId: string, fileName: string) {
    return request<{ assetPath: string; fileName: string; groupId: string }>("/api/theme-asset/delete", {
      method: "POST",
      body: JSON.stringify({ groupId, fileName })
    });
  },
  createFileSystemEntry(
    parentPath: string,
    entryType: "file" | "directory",
    name: string,
    metadata?: Record<string, string>,
    options?: {
      allowDuplicateTitle?: boolean;
    }
  ) {
    return request<{ path: string }>("/api/fs/create", {
      method: "POST",
      body: JSON.stringify({
        parentPath,
        entryType,
        name,
        metadata,
        allowDuplicateTitle: options?.allowDuplicateTitle
      })
    });
  },
  renameFileSystemEntry(
    path: string,
    nextName: string,
    options?: {
      allowDuplicateTitle?: boolean;
      title?: string;
    }
  ) {
    return request<{ path: string }>("/api/fs/rename", {
      method: "POST",
      body: JSON.stringify({
        path,
        nextName,
        title: options?.title,
        allowDuplicateTitle: options?.allowDuplicateTitle
      })
    });
  },
  getFileSystemMetadata(path: string) {
    return request<FileSystemMetadataPayload>(`/api/fs/metadata?path=${encodeURIComponent(path)}`);
  },
  saveFileSystemMetadata(path: string, metadata: Record<string, unknown>) {
    return request<{ type: "directory" | "file" }>("/api/fs/metadata", {
      method: "POST",
      body: JSON.stringify({ path, metadata })
    });
  },
  deleteFileSystemEntry(path: string) {
    return request<{ ok: true }>("/api/fs/delete", {
      method: "POST",
      body: JSON.stringify({ path })
    });
  },
  transferFileSystemEntry(sourcePath: string, targetDirectoryPath: string, mode: "copy" | "move") {
    return request<{ path: string }>("/api/fs/transfer", {
      method: "POST",
      body: JSON.stringify({
        sourcePath,
        targetDirectoryPath,
        mode
      })
    });
  },
  uploadPastedImages(
    articlePath: string,
    images: Array<{ mimeType: string; base64Data: string; fileName?: string }>
  ) {
    return request<{ assets: ClipboardAssetPayload[] }>("/api/assets/paste-image", {
      method: "POST",
      body: JSON.stringify({
        articlePath,
        images
      })
    });
  },
  listMediaAssets() {
    return request<{ assets: MediaAssetPayload[] }>("/api/media");
  },
  uploadMediaAssets(images: Array<{ mimeType: string; base64Data: string; fileName?: string }>) {
    return request<{ assets: ClipboardAssetPayload[] }>("/api/media", {
      method: "POST",
      body: JSON.stringify({ images })
    });
  },
  getGitStatus() {
    return request<{ files: GitChangedFilePayload[]; initialized: boolean }>("/api/git/status");
  },
  getGitHistory() {
    return request<{ commits: GitCommitPayload[]; initialized: boolean }>("/api/git/history");
  },
  initGitRepository() {
    return request<{ message: string }>("/api/git/init", {
      method: "POST"
    });
  },
  createGitCommit(message: string) {
    return request<{ message: string }>("/api/git/commit", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  },
  publishSite() {
    return request<{ stdout: string; stderr: string }>("/api/publish", {
      method: "POST"
    });
  }
};
