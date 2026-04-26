import { useCallback, useEffect, useState } from "react";

import type { ProjectLogRecord } from "@blog-system/content-core";

import { api } from "../../api";

import { formatProjectDateTime } from "../project-utils";
import type { PaneComponentProps } from "../types";
import {
  promptCreateProject,
  promptCreateProjectLogType,
  useProjectSelection
} from "./project-pane-shared";

export function ProjectLogPane({
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
  const [logs, setLogs] = useState<ProjectLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!selectedProjectId) {
      setLogs([]);
      return [];
    }

    setLoadingLogs(true);
    try {
      const payload = await api.listProjectLogs(selectedProjectId);
      setLogs(payload.logs);
      workbenchApi.showError(null);
      return payload.logs;
    } catch (error) {
      workbenchApi.showError((error as Error).message);
      return [];
    } finally {
      setLoadingLogs(false);
    }
  }, [selectedProjectId, workbenchApi]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const refresh = async () => {
    await Promise.all([
      loadProjects(),
      loadLogs(),
      workbenchApi.refreshWorkspaceData("projects")
    ]);
  };

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <strong>Log</strong>
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

                const type = await promptCreateProjectLogType(workbenchApi);
                if (!type) {
                  return;
                }

                workbenchApi.setBusy(`Creating ${type} event...`);
                try {
                  const payload = await api.createProjectLog(targetProjectId, type);
                  await refresh();
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
        {loadingProjects || loadingLogs ? (
          <div className="empty-state">Loading event log...</div>
        ) : !selectedProject ? (
          <div className="empty-state">Choose a project to see its event stream.</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">No events yet.</div>
        ) : (
          logs.map((entry) => (
            <button
              className="search-result project-list-item"
              key={entry.id}
              onClick={() =>
                void workbenchApi.openResource({
                  kind: "projectLog",
                  logId: entry.id,
                  projectId: selectedProject.id
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
          ))
        )}
      </div>
    </div>
  );
}
