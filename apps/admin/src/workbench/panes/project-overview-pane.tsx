import { formatProjectDateTime } from "../project-utils";
import type { PaneComponentProps } from "../types";
import { promptCreateProject, useProjectSelection } from "./project-pane-shared";

export function ProjectOverviewPane({
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

  const refresh = async () => {
    await Promise.all([loadProjects(), workbenchApi.refreshWorkspaceData("projects")]);
  };

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <strong>Project</strong>
          <div className="render-style-actions">
            <button
              className="action-button primary"
              onClick={async () => {
                const payload = await promptCreateProject(workbenchApi);
                if (!payload) {
                  return;
                }

                setSelectedProjectId(payload.value.id);
                await refresh();
                await workbenchApi.openResource({
                  kind: "project",
                  projectId: payload.value.id
                });
                workbenchApi.showSidebarModule("project", "project-overview");
              }}
              type="button"
            >
              New Project
            </button>
            <button className="action-button ghost" onClick={() => void refresh()} type="button">
              Refresh
            </button>
          </div>
        </div>
        <label>
          <span>Selected Project</span>
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
      <div className="sidebar-section">
        {loadingProjects ? (
          <div className="empty-state">Loading projects...</div>
        ) : !selectedProject ? (
          <div className="empty-state">Create a project to begin.</div>
        ) : (
          <div className="project-summary-card">
            <div className="project-summary-card__header">
              <strong>{selectedProject.title}</strong>
              <span className="status-pill info">{selectedProject.status || "active"}</span>
            </div>
            <div className="project-summary-card__meta">
              <span>Updated: {formatProjectDateTime(selectedProject.updatedAt)}</span>
            </div>
            <div className="render-style-actions">
              <button
                className="action-button accent"
                onClick={() =>
                  void workbenchApi.openResource({
                    kind: "project",
                    projectId: selectedProject.id
                  })
                }
                type="button"
              >
                Open Overview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
