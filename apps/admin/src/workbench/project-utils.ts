import type { AdminHomeConfig, ProjectSummary } from "@blog-system/content-core";

export const PROJECT_MODULE_ID = "project";
export const PROJECT_OVERVIEW_PANE_ID = "project-overview";
const PROJECT_HOME_WIDGETS_CHANGED_EVENT = "admin-project-home-widgets-changed";
const PROJECT_HOME_WIDGET_PREFIX = "project-home:";
const SELECTED_PROJECT_STORAGE_KEY = "admin-project-plugin:selected-project-id";

export interface ProjectHomeWidgetState {
  kind: "project-home";
  projectId: string;
}

export function getProjectDocumentPath(projectId: string) {
  return `projects/${projectId}/project.json`;
}

export function getProjectTaskDocumentPath(projectId: string, taskId: string) {
  return `projects/${projectId}/tasks/${taskId}.md`;
}

export function getProjectLogDocumentPath(projectId: string, logId: string) {
  return `projects/${projectId}/logs/${logId}.md`;
}

export function getProjectHomeWidgetId(projectId: string) {
  return `${PROJECT_HOME_WIDGET_PREFIX}${projectId}`;
}

export function isProjectHomeWidgetId(widgetId: string) {
  return widgetId.startsWith(PROJECT_HOME_WIDGET_PREFIX);
}

export function createProjectHomeWidgetState(projectId: string): ProjectHomeWidgetState {
  return {
    kind: "project-home",
    projectId
  };
}

export function getProjectHomeWidgetProjectId(widgetId: string, value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const projectId = (value as { projectId?: unknown }).projectId;
    if (typeof projectId === "string" && projectId.trim()) {
      return projectId.trim();
    }
  }

  if (!isProjectHomeWidgetId(widgetId)) {
    return null;
  }

  return widgetId.slice(PROJECT_HOME_WIDGET_PREFIX.length) || null;
}

export function isProjectPinnedToHome(config: AdminHomeConfig, projectId: string) {
  return config.widgetOrder.includes(getProjectHomeWidgetId(projectId));
}

export function addProjectHomeWidget(config: AdminHomeConfig, projectId: string): AdminHomeConfig {
  const widgetId = getProjectHomeWidgetId(projectId);
  return {
    ...config,
    widgetOrder: [...config.widgetOrder.filter((entry) => entry !== widgetId), widgetId],
    widgets: {
      ...config.widgets,
      [widgetId]: createProjectHomeWidgetState(projectId)
    }
  };
}

export function removeProjectHomeWidget(config: AdminHomeConfig, projectId: string): AdminHomeConfig {
  const widgetId = getProjectHomeWidgetId(projectId);
  const { [widgetId]: _removed, ...remainingWidgets } = config.widgets;

  return {
    ...config,
    widgetOrder: config.widgetOrder.filter((entry) => entry !== widgetId),
    widgets: remainingWidgets
  };
}

export function notifyProjectHomeWidgetsChanged(config?: AdminHomeConfig) {
  window.dispatchEvent(new CustomEvent<AdminHomeConfig | undefined>(PROJECT_HOME_WIDGETS_CHANGED_EVENT, {
    detail: config
  }));
}

export function subscribeProjectHomeWidgetsChanged(listener: (config?: AdminHomeConfig) => void) {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<AdminHomeConfig | undefined>).detail);
  };
  window.addEventListener(PROJECT_HOME_WIDGETS_CHANGED_EVENT, handleEvent);

  return () => {
    window.removeEventListener(PROJECT_HOME_WIDGETS_CHANGED_EVENT, handleEvent);
  };
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
