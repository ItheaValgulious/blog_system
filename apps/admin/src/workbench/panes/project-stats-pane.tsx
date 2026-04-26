import { formatProjectDate, formatProjectDateTime } from "../project-utils";
import type { PaneComponentProps } from "../types";
import { useProjectSelection } from "./project-pane-shared";

export function ProjectStatsPane({
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

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <strong>Stats</strong>
          <button
            className="action-button ghost"
            onClick={() =>
              void Promise.all([loadProjects(), workbenchApi.refreshWorkspaceData("projects")])
            }
            type="button"
          >
            Refresh
          </button>
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
      <div className="sidebar-section">
        {loadingProjects ? (
          <div className="empty-state">Loading stats...</div>
        ) : !selectedProject ? (
          <div className="empty-state">Choose a project to inspect derived stats.</div>
        ) : (
          <div className="project-stat-grid">
            <div className="project-stat-tile large">
              <strong>{selectedProject.taskCount}</strong>
              <span>Total tasks</span>
            </div>
            <div className="project-stat-tile large">
              <strong>{selectedProject.completedTaskCount}</strong>
              <span>Completed tasks</span>
            </div>
            <div className="project-stat-tile large">
              <strong>{selectedProject.recentActivityCount}</strong>
              <span>Recent activity (7d)</span>
            </div>
            <div className="project-stat-detail">
              <span>Status</span>
              <strong>{selectedProject.status || "active"}</strong>
            </div>
            <div className="project-stat-detail">
              <span>Start date</span>
              <strong>{formatProjectDate(selectedProject.startDate)}</strong>
            </div>
            <div className="project-stat-detail">
              <span>Target date</span>
              <strong>{formatProjectDate(selectedProject.targetDate)}</strong>
            </div>
            <div className="project-stat-detail">
              <span>Last updated</span>
              <strong>{formatProjectDateTime(selectedProject.updatedAt)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
