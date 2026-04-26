import type { ProjectResourceRecord, ProjectSummary } from "@blog-system/content-core";

export const PROJECT_MODULE_ID = "project";
export const PROJECT_OVERVIEW_PANE_ID = "project-overview";
export const PROJECT_TASKS_PANE_ID = "project-tasks";
export const PROJECT_LOG_PANE_ID = "project-log";
export const PROJECT_RESOURCES_PANE_ID = "project-resources";
export const PROJECT_STATS_PANE_ID = "project-stats";
const SELECTED_PROJECT_STORAGE_KEY = "admin-project-plugin:selected-project-id";

export function getProjectDocumentPath(projectId: string) {
  return `projects/${projectId}/project.json`;
}

export function getProjectTaskDocumentPath(projectId: string, taskId: string) {
  return `projects/${projectId}/tasks/${taskId}.md`;
}

export function getProjectLogDocumentPath(projectId: string, logId: string) {
  return `projects/${projectId}/logs/${logId}.md`;
}

export function getProjectResourceReference(resourceId: string) {
  return `@resource/${resourceId}`;
}

export function getProjectResourceFileUrl(projectId: string, resource: ProjectResourceRecord) {
  if (!resource.filePath) {
    return null;
  }

  return `/project-files/${projectId}/${resource.filePath}`.replace(/\\/g, "/");
}

export function loadStoredProjectId() {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeProjectId(projectId: string | null) {
  try {
    if (projectId) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId);
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and keep selection in memory.
  }
}

export function resolveSelectedProjectId(
  projects: ProjectSummary[],
  preferredProjectId: string | null | undefined
) {
  if (preferredProjectId && projects.some((project) => project.id === preferredProjectId)) {
    return preferredProjectId;
  }

  const storedProjectId = loadStoredProjectId();
  if (storedProjectId && projects.some((project) => project.id === storedProjectId)) {
    return storedProjectId;
  }

  return projects[0]?.id ?? null;
}

export function formatProjectDate(value: string) {
  if (!value) {
    return "Not set";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
  }).format(new Date(timestamp));
}

export function formatProjectDateTime(value: string) {
  if (!value) {
    return "Not set";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}
