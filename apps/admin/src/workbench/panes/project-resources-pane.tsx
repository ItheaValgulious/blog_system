import { useCallback, useEffect, useState } from "react";

import type { ProjectResourceRecord, ProjectResourceType } from "@blog-system/content-core";

import { api } from "../../api";

import {
  formatProjectDateTime,
  getProjectResourceFileUrl,
  getProjectResourceReference
} from "../project-utils";
import type { PaneComponentProps } from "../types";
import { promptCreateProject, useProjectSelection } from "./project-pane-shared";

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

const RESOURCE_TYPES: ProjectResourceType[] = ["webpage", "note", "file"];

export function ProjectResourcesPane({
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
  const [resources, setResources] = useState<ProjectResourceRecord[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceType, setResourceType] = useState<ProjectResourceType>("webpage");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceSource, setResourceSource] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);

  const loadResources = useCallback(async () => {
    if (!selectedProjectId) {
      setResources([]);
      return [];
    }

    setLoadingResources(true);
    try {
      const payload = await api.listProjectResources(selectedProjectId);
      setResources(payload.resources);
      workbenchApi.showError(null);
      return payload.resources;
    } catch (error) {
      workbenchApi.showError((error as Error).message);
      return [];
    } finally {
      setLoadingResources(false);
    }
  }, [selectedProjectId, workbenchApi]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  const refresh = async () => {
    await Promise.all([
      loadProjects(),
      loadResources(),
      workbenchApi.refreshWorkspaceData("projects")
    ]);
  };

  const resetDraft = () => {
    setResourceType("webpage");
    setResourceTitle("");
    setResourceSource("");
    setResourceDescription("");
    setResourceFile(null);
  };

  return (
    <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <strong>Resources</strong>
          <button className="action-button ghost" onClick={() => void refresh()} type="button">
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
        <strong>New Resource</strong>
        <label>
          <span>Type</span>
          <select
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value as ProjectResourceType)}
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Title</span>
          <input value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} />
        </label>
        <label>
          <span>Source</span>
          <input
            placeholder="URL, citation, or note"
            value={resourceSource}
            onChange={(event) => setResourceSource(event.target.value)}
          />
        </label>
        <label>
          <span>Description</span>
          <input
            value={resourceDescription}
            onChange={(event) => setResourceDescription(event.target.value)}
          />
        </label>
        <label>
          <span>Upload File</span>
          <input
            onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
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

              if (!resourceTitle.trim() && !resourceFile) {
                workbenchApi.showError("A resource title or uploaded file is required.");
                return;
              }

              workbenchApi.setBusy("Creating resource...");
              try {
                const payload = await api.createProjectResource({
                  description: resourceDescription.trim() || undefined,
                  file: resourceFile ? await fileToBase64(resourceFile) : undefined,
                  projectId: targetProjectId,
                  source: resourceSource.trim() || undefined,
                  title: resourceTitle.trim() || undefined,
                  type: resourceType
                });
                await refresh();
                await navigator.clipboard.writeText(getProjectResourceReference(payload.value.id));
                resetDraft();
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
          <button className="action-button ghost" onClick={resetDraft} type="button">
            Clear
          </button>
        </div>
      </div>
      <div className="sidebar-section search-results">
        {loadingProjects || loadingResources ? (
          <div className="empty-state">Loading resources...</div>
        ) : !selectedProject ? (
          <div className="empty-state">Choose a project to manage its resources.</div>
        ) : resources.length === 0 ? (
          <div className="empty-state">No resources yet.</div>
        ) : (
          resources.map((resource) => {
            const fileUrl = getProjectResourceFileUrl(selectedProject.id, resource);

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
                      if (!selectedProjectId || !window.confirm(`Delete "${resource.title}"?`)) {
                        return;
                      }

                      workbenchApi.setBusy(`Deleting ${resource.title}...`);
                      try {
                        await api.deleteProjectResource(selectedProjectId, resource.id);
                        await refresh();
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
          })
        )}
      </div>
    </div>
  );
}
