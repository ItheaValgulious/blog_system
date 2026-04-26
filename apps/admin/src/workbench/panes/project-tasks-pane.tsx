import { useCallback, useEffect, useState } from "react";

import type { ProjectTaskRecord } from "@blog-system/content-core";

import { api } from "../../api";

import { formatProjectDate, formatProjectDateTime } from "../project-utils";
import type { PaneComponentProps } from "../types";
import { promptCreateProject, useProjectSelection } from "./project-pane-shared";

export function ProjectTasksPane({
  activeDocument,
  api: workbenchApi,
  projects: availableProjects
}: PaneComponentProps) {
  const {
    loadProjects,
    loadingProjects,
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId
  } = useProjectSelection(activeDocument, workbenchApi, availableProjects);
  const [tasks, setTasks] = useState<ProjectTaskRecord[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!selectedProjectId) {
      setTasks([]);
      return [];
    }

    setLoadingTasks(true);
    try {
      const payload = await api.listProjectTasks(selectedProjectId);
      setTasks(payload.tasks);
      workbenchApi.showError(null);
      return payload.tasks;
    } catch (error) {
      workbenchApi.showError((error as Error).message);
      return [];
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedProjectId, workbenchApi]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const refresh = async () => {
    await Promise.all([
      loadProjects(),
      loadTasks(),
      workbenchApi.refreshWorkspaceData("projects")
    ]);
  };

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <strong>Tasks</strong>
          <div className="render-style-actions">
            <button
              className="action-button primary"
              onClick={async () => {
                let targetProjectId = selectedProjectId;
                if (!targetProjectId) {
                  const projectPayload = await promptCreateProject(workbenchApi);
                  if (!projectPayload) {
                    return;
                  }

                  targetProjectId = projectPayload.value.id;
                  setSelectedProjectId(targetProjectId);
                  await refresh();
                }

                const title = window.prompt("Task title");
                if (!title?.trim() || !targetProjectId) {
                  return;
                }

                workbenchApi.setBusy(`Creating ${title.trim()}...`);
                try {
                  const payload = await api.createProjectTask(targetProjectId, title.trim());
                  await refresh();
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
            <button className="action-button ghost" onClick={() => void refresh()} type="button">
              Refresh
            </button>
          </div>
        </div>
        <label>
          <span>Project</span>
          <select
            value={selectedProjectId ?? ""}
            onChange={(event) => setSelectedProjectId(event.target.value || null)}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sidebar-section search-results">
        {loadingProjects || loadingTasks ? (
          <div className="empty-state">Loading tasks...</div>
        ) : !selectedProject ? (
          <div className="empty-state">Choose a project to see its task list.</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">No tasks yet.</div>
        ) : (
          tasks.map((task) => (
            <button
              className="search-result project-list-item"
              key={task.id}
              onClick={() =>
                void workbenchApi.openResource({
                  kind: "projectTask",
                  projectId: selectedProject.id,
                  taskId: task.id
                })
              }
              type="button"
            >
              <div className="project-list-item__row">
                <strong>{task.title}</strong>
                <span className="status-pill info">{task.status || "todo"}</span>
              </div>
              <span>
                Order {task.order} | Start {formatProjectDate(task.startDate)} | Due{" "}
                {formatProjectDate(task.dueDate)}
              </span>
              <span>{task.excerpt || "Open to add details."}</span>
              <span>Updated {formatProjectDateTime(task.updatedAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
