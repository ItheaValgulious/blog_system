import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import {
  PROJECT_RECENT_ACTIVITY_WINDOW_DAYS,
  PROJECT_RESOURCE_TYPE_VALUES,
  PROJECT_STATUS_VALUES,
  PROJECT_TASK_STATUS_VALUES,
  isProjectTaskCompletedStatus,
  parseProjectLogRecord,
  parseProjectRecord,
  parseProjectTaskRecord,
  serializeProjectLogRecord,
  serializeProjectRecord,
  serializeProjectTaskRecord,
  type ProjectLogRecord,
  type ProjectResourceRecord,
  type ProjectResourceType,
  type ProjectTaskRecord
} from "@blog-system/content-core";

import { api } from "../../api";

import { formatProjectDate, formatProjectDateTime, getProjectResourceFileUrl, getProjectResourceReference } from "../project-utils";
import type { WorkbenchEditorComponentProps } from "../types";
import type {
  ProjectLogWorkbenchDocument,
  ProjectTaskWorkbenchDocument,
  ProjectWorkbenchDocument
} from "../types";

type ProjectOverviewTab = "overview" | "tasks" | "logs" | "resources" | "stats";

function renderMarkdownBodyEditor(
  editorKey: string,
  path: string,
  value: string,
  onChange: (nextValue: string) => void,
  onMount: WorkbenchEditorComponentProps["onMount"]
) {
  return (
    <Editor
      key={editorKey}
      defaultLanguage="markdown"
      defaultValue={value}
      language="markdown"
      onMount={onMount}
      options={{
        automaticLayout: true,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        quickSuggestions: { other: true, strings: true, comments: false },
        smoothScrolling: true,
        snippetSuggestions: "top",
        tabCompletion: "on",
        wordWrap: "on"
      }}
      path={path}
      onChange={(nextValue) => {
        onChange(nextValue ?? "");
      }}
    />
  );
}

function updateProjectDocument(
  document: ProjectWorkbenchDocument,
  rawValue: string,
  update: Partial<ReturnType<typeof parseProjectRecord>>
) {
  const parsed = parseProjectRecord(document.projectId, rawValue);
  return serializeProjectRecord({
    ...parsed,
    ...update
  });
}

function updateTaskDocument(
  document: ProjectTaskWorkbenchDocument,
  rawValue: string,
  update: Partial<ReturnType<typeof parseProjectTaskRecord>>
) {
  const parsed = parseProjectTaskRecord(document.taskId, rawValue);
  return serializeProjectTaskRecord({
    ...parsed,
    ...update
  });
}

function updateLogDocument(
  document: ProjectLogWorkbenchDocument,
  rawValue: string,
  update: Partial<ReturnType<typeof parseProjectLogRecord>>
) {
  const parsed = parseProjectLogRecord(document.logId, rawValue);
  return serializeProjectLogRecord({
    ...parsed,
    ...update
  });
}

function splitCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildProjectStats(tasks: ProjectTaskRecord[], logs: ProjectLogRecord[]) {
  const cutoff = Date.now() - PROJECT_RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return {
    completedTaskCount: tasks.filter((task) => isProjectTaskCompletedStatus(task.status)).length,
    recentActivityCount: logs.filter((entry) => {
      const timestamp = Date.parse(entry.occurredAt || entry.updatedAt || entry.createdAt);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    }).length,
    taskCount: tasks.length
  };
}

async function fileToBase64(file: File) {
  return new Promise<{ base64Data: string; fileName: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve({
        base64Data: result.split(",")[1] ?? "",
        fileName: file.name
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function ProjectOverviewSection({
  children,
  title,
  toolbar
}: {
  children: ReactNode;
  title: string;
  toolbar?: ReactNode;
}) {
  return (
    <section className="project-overview-section">
      <div className="project-overview-section__header">
        <strong>{title}</strong>
        {toolbar ? <div className="render-style-actions">{toolbar}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ProjectOverviewEditor({
  api: workbenchApi,
  document,
  onChange,
  onMount,
  path,
  value
}: WorkbenchEditorComponentProps) {
  const projectDocument = document as ProjectWorkbenchDocument;
  const parsed = parseProjectRecord(projectDocument.projectId, value);
  const projectId = projectDocument.projectId;
  const [activeTab, setActiveTab] = useState<ProjectOverviewTab>("overview");
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [tasks, setTasks] = useState<ProjectTaskRecord[]>([]);
  const [logs, setLogs] = useState<ProjectLogRecord[]>([]);
  const [resources, setResources] = useState<ProjectResourceRecord[]>([]);
  const [resourceType, setResourceType] = useState<ProjectResourceType>("webpage");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceSource, setResourceSource] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceFileInputKey, setResourceFileInputKey] = useState(0);
  const showWorkbenchError = workbenchApi.showError;

  const stats = useMemo(() => buildProjectStats(tasks, logs), [logs, tasks]);

  const resetResourceDraft = useCallback(() => {
    setResourceType("webpage");
    setResourceTitle("");
    setResourceSource("");
    setResourceDescription("");
    setResourceFile(null);
    setResourceFileInputKey((current) => current + 1);
  }, []);

  const loadProjectWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    try {
      const [taskPayload, logPayload, resourcePayload] = await Promise.all([
        api.listProjectTasks(projectId),
        api.listProjectLogs(projectId),
        api.listProjectResources(projectId)
      ]);
      setTasks(taskPayload.tasks);
      setLogs(logPayload.logs);
      setResources(resourcePayload.resources);
      showWorkbenchError(null);
    } catch (error) {
      showWorkbenchError((error as Error).message);
    } finally {
      setLoadingWorkspace(false);
    }
  }, [projectId, showWorkbenchError]);

  useEffect(() => {
    setActiveTab("overview");
    resetResourceDraft();
    void loadProjectWorkspace();
  }, [loadProjectWorkspace, projectId, resetResourceDraft]);

  const refreshProjectWorkspace = async () => {
    await Promise.all([loadProjectWorkspace(), workbenchApi.refreshWorkspaceData("projects")]);
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Delete project "${parsed.title}"? This will remove its tasks, logs, and resources.`)) {
      return;
    }

    workbenchApi.setBusy(`Deleting ${parsed.title}...`);
    try {
      await api.deleteProject(projectId);
      await workbenchApi.refreshWorkspaceData("projects");
      workbenchApi.closeProjectDocuments(projectId);
      workbenchApi.showError(null);
    } catch (error) {
      workbenchApi.showError((error as Error).message);
    } finally {
      workbenchApi.setBusy(null);
    }
  };

  const tabs: Array<{ id: ProjectOverviewTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks" },
    { id: "logs", label: "Logs" },
    { id: "resources", label: "Resources" },
    { id: "stats", label: "Stats" }
  ];

  return (
    <div className="project-editor project-editor--overview">
      <div className="project-editor__header">
        <div className="project-editor__header-row">
          <strong>{parsed.title}</strong>
          <span className="status-pill info">{parsed.status}</span>
        </div>
        <div className="project-editor__tabs" role="tablist" aria-label="Project overview sections">
          {tabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={`project-editor__tab ${activeTab === tab.id ? "is-active" : ""}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="project-editor__content">
        {activeTab === "overview" ? (
          <div className="project-overview-stack">
            <ProjectOverviewSection title="Project Details">
              <div className="project-editor__form-rows">
                <div className="project-editor__field-row">
                  <label className="project-editor__field">
                    <span>Title</span>
                    <input
                      className="project-editor__control"
                      value={parsed.title}
                      onChange={(event) =>
                        onChange(
                          updateProjectDocument(projectDocument, value, {
                            title: event.target.value
                          })
                        )
                      }
                    />
                  </label>
                  <label className="project-editor__field">
                    <span>Status</span>
                    <select
                      className="project-editor__control"
                      value={parsed.status}
                      onChange={(event) =>
                        onChange(
                          updateProjectDocument(projectDocument, value, {
                            status: event.target.value as (typeof PROJECT_STATUS_VALUES)[number]
                          })
                        )
                      }
                    >
                      {PROJECT_STATUS_VALUES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="project-editor__field-row">
                  <label className="project-editor__field">
                    <span>Start Date</span>
                    <input
                      className="project-editor__control"
                      type="date"
                      value={parsed.startDate}
                      onChange={(event) =>
                        onChange(
                          updateProjectDocument(projectDocument, value, {
                            startDate: event.target.value
                          })
                        )
                      }
                    />
                  </label>
                  <label className="project-editor__field">
                    <span>Target Date</span>
                    <input
                      className="project-editor__control"
                      type="date"
                      value={parsed.targetDate}
                      onChange={(event) =>
                        onChange(
                          updateProjectDocument(projectDocument, value, {
                            targetDate: event.target.value
                          })
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </ProjectOverviewSection>

            <ProjectOverviewSection title="Goal">
              <div className="project-editor__embedded-editor">
                {renderMarkdownBodyEditor(
                  `${document.id}:${document.editorId}:goal`,
                  `${path}#goal.md`,
                  parsed.goal,
                  (nextGoal) =>
                    onChange(
                      updateProjectDocument(projectDocument, value, {
                        goal: nextGoal
                      })
                    ),
                  onMount
                )}
              </div>
            </ProjectOverviewSection>

            <ProjectOverviewSection title="Metadata">
              <div className="project-editor__meta">
                <span>Project Id: {parsed.id}</span>
                <span>Created: {parsed.createdAt || "Not set"}</span>
                <span>Updated: {parsed.updatedAt || "Not set"}</span>
              </div>
            </ProjectOverviewSection>

            <ProjectOverviewSection title="Danger Zone">
              <div className="project-editor__danger-zone">
                <p className="body-muted">
                  Delete this project and all of its tasks, logs, and resources.
                </p>
                <button className="action-button danger" onClick={() => void handleDeleteProject()} type="button">
                  Delete Project
                </button>
              </div>
            </ProjectOverviewSection>
          </div>
        ) : null}

        {activeTab === "tasks" ? (
          <div className="project-overview-stack">
            <ProjectOverviewSection
              title="Tasks"
              toolbar={
                <>
                  <button
                    className="action-button primary"
                    onClick={async () => {
                      const title = window.prompt("Task title");
                      if (!title?.trim()) {
                        return;
                      }

                      workbenchApi.setBusy(`Creating ${title.trim()}...`);
                      try {
                        const payload = await api.createProjectTask(projectId, title.trim());
                        await refreshProjectWorkspace();
                        await workbenchApi.openResource({
                          kind: "projectTask",
                          projectId: payload.projectId,
                          taskId: payload.value.id
                        });
                        workbenchApi.showError(null);
                      } catch (error) {
                        workbenchApi.showError((error as Error).message);
                      } finally {
                        workbenchApi.setBusy(null);
                      }
                    }}
                    type="button"
                  >
                    New Task
                  </button>
                  <button className="action-button ghost" onClick={() => void refreshProjectWorkspace()} type="button">
                    Refresh
                  </button>
                </>
              }
            >
              {loadingWorkspace ? (
                <div className="empty-state">Loading tasks...</div>
              ) : tasks.length === 0 ? (
                <div className="empty-state">No tasks yet.</div>
              ) : (
                <div className="project-editor__list">
                  {tasks.map((task) => (
                    <button
                      className="search-result project-list-item"
                      key={task.id}
                      onClick={() =>
                        void workbenchApi.openResource({
                          kind: "projectTask",
                          projectId,
                          taskId: task.id
                        })
                      }
                      type="button"
                    >
                      <div className="project-list-item__row">
                        <strong>{task.title}</strong>
                        <span className="status-pill info">{task.status}</span>
                      </div>
                      <span>
                        Order {task.order} | Start {formatProjectDate(task.startDate)} | Due{" "}
                        {formatProjectDate(task.dueDate)}
                      </span>
                      <span>{task.excerpt || "Open to add details."}</span>
                      <span>Updated {formatProjectDateTime(task.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </ProjectOverviewSection>
          </div>
        ) : null}

        {activeTab === "logs" ? (
          <div className="project-overview-stack">
            <ProjectOverviewSection
              title="Logs"
              toolbar={
                <>
                  <button
                    className="action-button primary"
                    onClick={async () => {
                      const type = window.prompt("Log type", "note")?.trim() || "note";

                      workbenchApi.setBusy(`Creating ${type} event...`);
                      try {
                        const payload = await api.createProjectLog(projectId, type);
                        await refreshProjectWorkspace();
                        await workbenchApi.openResource({
                          kind: "projectLog",
                          logId: payload.value.id,
                          projectId: payload.projectId
                        });
                        workbenchApi.showError(null);
                      } catch (error) {
                        workbenchApi.showError((error as Error).message);
                      } finally {
                        workbenchApi.setBusy(null);
                      }
                    }}
                    type="button"
                  >
                    New Event
                  </button>
                  <button className="action-button ghost" onClick={() => void refreshProjectWorkspace()} type="button">
                    Refresh
                  </button>
                </>
              }
            >
              {loadingWorkspace ? (
                <div className="empty-state">Loading event log...</div>
              ) : logs.length === 0 ? (
                <div className="empty-state">No events yet.</div>
              ) : (
                <div className="project-editor__list">
                  {logs.map((entry) => (
                    <button
                      className="search-result project-list-item"
                      key={entry.id}
                      onClick={() =>
                        void workbenchApi.openResource({
                          kind: "projectLog",
                          logId: entry.id,
                          projectId
                        })
                      }
                      type="button"
                    >
                      <div className="project-list-item__row">
                        <strong>{entry.title}</strong>
                        <span className="tag-chip">{entry.type || "note"}</span>
                      </div>
                      <span>Occurred {formatProjectDateTime(entry.occurredAt)}</span>
                      {entry.taskIds.length > 0 ? <span>Tasks: {entry.taskIds.join(", ")}</span> : null}
                      <span>{entry.excerpt || "Open to add event details."}</span>
                    </button>
                  ))}
                </div>
              )}
            </ProjectOverviewSection>
          </div>
        ) : null}

        {activeTab === "resources" ? (
          <div className="project-overview-stack">
            <ProjectOverviewSection title="New Resource">
              <div className="project-editor__resource-form">
                <div className="project-editor__form-rows">
                  <div className="project-editor__field-row">
                    <label className="project-editor__field">
                      <span>Type</span>
                      <select
                        className="project-editor__control"
                        value={resourceType}
                        onChange={(event) => setResourceType(event.target.value as ProjectResourceType)}
                      >
                        {PROJECT_RESOURCE_TYPE_VALUES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="project-editor__field">
                      <span>Title</span>
                      <input
                        className="project-editor__control"
                        value={resourceTitle}
                        onChange={(event) => setResourceTitle(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="project-editor__field-row">
                    <label className="project-editor__field">
                      <span>Source</span>
                      <input
                        className="project-editor__control"
                        placeholder="URL, citation, or note"
                        value={resourceSource}
                        onChange={(event) => setResourceSource(event.target.value)}
                      />
                    </label>
                    <label className="project-editor__field">
                      <span>Description</span>
                      <input
                        className="project-editor__control"
                        value={resourceDescription}
                        onChange={(event) => setResourceDescription(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="project-editor__field-row">
                    <label className="project-editor__field project-editor__file-field">
                      <span>Upload File</span>
                      <input
                        className="project-editor__control project-editor__control--file"
                        key={resourceFileInputKey}
                        onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)}
                        type="file"
                      />
                    </label>
                  </div>
                </div>
                <div className="render-style-actions">
                  <button
                    className="action-button primary"
                    onClick={async () => {
                      if (!resourceTitle.trim() && !resourceFile) {
                        workbenchApi.showError("A resource title or uploaded file is required.");
                        return;
                      }

                      workbenchApi.setBusy("Creating resource...");
                      try {
                        const payload = await api.createProjectResource({
                          description: resourceDescription.trim() || undefined,
                          file: resourceFile ? await fileToBase64(resourceFile) : undefined,
                          projectId,
                          source: resourceSource.trim() || undefined,
                          title: resourceTitle.trim() || undefined,
                          type: resourceType
                        });
                        await refreshProjectWorkspace();
                        await navigator.clipboard.writeText(getProjectResourceReference(payload.value.id));
                        resetResourceDraft();
                        workbenchApi.showError(null);
                      } catch (error) {
                        workbenchApi.showError((error as Error).message);
                      } finally {
                        workbenchApi.setBusy(null);
                      }
                    }}
                    type="button"
                  >
                    Create Resource
                  </button>
                  <button className="action-button ghost" onClick={resetResourceDraft} type="button">
                    Clear
                  </button>
                </div>
              </div>
            </ProjectOverviewSection>

            <ProjectOverviewSection
              title="Resources"
              toolbar={
                <button className="action-button ghost" onClick={() => void refreshProjectWorkspace()} type="button">
                  Refresh
                </button>
              }
            >
              {loadingWorkspace ? (
                <div className="empty-state">Loading resources...</div>
              ) : resources.length === 0 ? (
                <div className="empty-state">No resources yet.</div>
              ) : (
                <div className="project-editor__list">
                  {resources.map((resource) => {
                    const fileUrl = getProjectResourceFileUrl(projectId, resource);

                    return (
                      <div className="project-resource-card" key={resource.id}>
                        <div className="project-list-item__row">
                          <strong>{resource.title}</strong>
                          <span className="tag-chip">{resource.type}</span>
                        </div>
                        <span>{resource.source || "No source provided."}</span>
                        {resource.description ? <span>{resource.description}</span> : null}
                        <span>
                          Ref: <code>{getProjectResourceReference(resource.id)}</code>
                        </span>
                        <span>Updated {formatProjectDateTime(resource.updatedAt)}</span>
                        <div className="render-style-actions">
                          <button
                            className="action-button ghost"
                            onClick={() => void navigator.clipboard.writeText(getProjectResourceReference(resource.id))}
                            type="button"
                          >
                            Copy Ref
                          </button>
                          {fileUrl ? (
                            <a className="action-button ghost project-resource-link" href={fileUrl} target="_blank">
                              Open File
                            </a>
                          ) : null}
                          {resource.source ? (
                            <a
                              className="action-button ghost project-resource-link"
                              href={resource.source}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open Source
                            </a>
                          ) : null}
                          <button
                            className="action-button danger"
                            onClick={async () => {
                              if (!window.confirm(`Delete "${resource.title}"?`)) {
                                return;
                              }

                              workbenchApi.setBusy(`Deleting ${resource.title}...`);
                              try {
                                await api.deleteProjectResource(projectId, resource.id);
                                await refreshProjectWorkspace();
                                workbenchApi.showError(null);
                              } catch (error) {
                                workbenchApi.showError((error as Error).message);
                              } finally {
                                workbenchApi.setBusy(null);
                              }
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ProjectOverviewSection>
          </div>
        ) : null}

        {activeTab === "stats" ? (
          <div className="project-overview-stack">
            <ProjectOverviewSection
              title="Stats"
              toolbar={
                <button className="action-button ghost" onClick={() => void refreshProjectWorkspace()} type="button">
                  Refresh
                </button>
              }
            >
              {loadingWorkspace ? (
                <div className="empty-state">Loading stats...</div>
              ) : (
                <div className="project-stat-grid">
                  <div className="project-stat-tile large">
                    <strong>{stats.taskCount}</strong>
                    <span>Total tasks</span>
                  </div>
                  <div className="project-stat-tile large">
                    <strong>{stats.completedTaskCount}</strong>
                    <span>Completed tasks</span>
                  </div>
                  <div className="project-stat-tile large">
                    <strong>{stats.recentActivityCount}</strong>
                    <span>Recent activity ({PROJECT_RECENT_ACTIVITY_WINDOW_DAYS}d)</span>
                  </div>
                </div>
              )}
            </ProjectOverviewSection>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectTaskEditor({
  document,
  onChange,
  onMount,
  path,
  value
}: WorkbenchEditorComponentProps) {
  const taskDocument = document as ProjectTaskWorkbenchDocument;
  const parsed = parseProjectTaskRecord(taskDocument.taskId, value);

  return (
    <div className="project-editor project-editor--with-body">
      <div className="project-editor__header">
        <div className="project-editor__field-grid">
          <label>
            <span>Title</span>
            <input
              value={parsed.title}
              onChange={(event) =>
                onChange(
                  updateTaskDocument(taskDocument, value, {
                    title: event.target.value
                  })
                )
              }
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={parsed.status}
              onChange={(event) =>
                onChange(
                  updateTaskDocument(taskDocument, value, {
                    status: event.target.value as (typeof PROJECT_TASK_STATUS_VALUES)[number]
                  })
                )
              }
            >
              {PROJECT_TASK_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Order</span>
            <input
              type="number"
              value={String(parsed.order)}
              onChange={(event) =>
                onChange(
                  updateTaskDocument(taskDocument, value, {
                    order: Number(event.target.value)
                  })
                )
              }
            />
          </label>
          <label>
            <span>Start Date</span>
            <input
              type="date"
              value={parsed.startDate}
              onChange={(event) =>
                onChange(
                  updateTaskDocument(taskDocument, value, {
                    startDate: event.target.value
                  })
                )
              }
            />
          </label>
          <label>
            <span>Due Date</span>
            <input
              type="date"
              value={parsed.dueDate}
              onChange={(event) =>
                onChange(
                  updateTaskDocument(taskDocument, value, {
                    dueDate: event.target.value
                  })
                )
              }
            />
          </label>
        </div>
        <div className="project-editor__meta">
          <span>Task Id: {parsed.id}</span>
          <span>Created: {parsed.createdAt || "Not set"}</span>
          <span>Updated: {parsed.updatedAt || "Not set"}</span>
          <span>Resource refs are indexed from `@resource/...` links in the body.</span>
        </div>
      </div>
      <div className="project-editor__body">
        {renderMarkdownBodyEditor(
          `${document.id}:${document.editorId}`,
          path,
          parsed.body,
          (nextBody) =>
            onChange(
              updateTaskDocument(taskDocument, value, {
                body: nextBody
              })
            ),
          onMount
        )}
      </div>
    </div>
  );
}

export function ProjectLogEditor({
  document,
  onChange,
  onMount,
  path,
  value
}: WorkbenchEditorComponentProps) {
  const logDocument = document as ProjectLogWorkbenchDocument;
  const parsed = parseProjectLogRecord(logDocument.logId, value);

  return (
    <div className="project-editor project-editor--with-body">
      <div className="project-editor__header">
        <div className="project-editor__field-grid">
          <label>
            <span>Type</span>
            <input
              value={parsed.type}
              onChange={(event) =>
                onChange(
                  updateLogDocument(logDocument, value, {
                    type: event.target.value
                  })
                )
              }
            />
          </label>
          <label>
            <span>Occurred At</span>
            <input
              type="datetime-local"
              value={parsed.occurredAt ? parsed.occurredAt.slice(0, 16) : ""}
              onChange={(event) =>
                onChange(
                  updateLogDocument(logDocument, value, {
                    occurredAt: event.target.value ? new Date(event.target.value).toISOString() : ""
                  })
                )
              }
            />
          </label>
          <label>
            <span>Task Ids</span>
            <input
              value={parsed.taskIds.join(", ")}
              onChange={(event) =>
                onChange(
                  updateLogDocument(logDocument, value, {
                    taskIds: splitCommaSeparated(event.target.value)
                  })
                )
              }
            />
          </label>
        </div>
        <div className="project-editor__meta">
          <span>Log Id: {parsed.id}</span>
          <span>Created: {parsed.createdAt || "Not set"}</span>
          <span>Updated: {parsed.updatedAt || "Not set"}</span>
          <span>Resource refs are indexed from `@resource/...` links in the body.</span>
        </div>
      </div>
      <div className="project-editor__body">
        {renderMarkdownBodyEditor(
          `${document.id}:${document.editorId}`,
          path,
          parsed.body,
          (nextBody) =>
            onChange(
              updateLogDocument(logDocument, value, {
                body: nextBody
              })
            ),
          onMount
        )}
      </div>
    </div>
  );
}
