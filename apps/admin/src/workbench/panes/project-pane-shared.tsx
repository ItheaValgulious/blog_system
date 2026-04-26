import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectSummary } from "@blog-system/content-core";

import { api } from "../../api";

import {
  resolveSelectedProjectId,
  storeProjectId
} from "../project-utils";
import type { PaneComponentProps, WorkbenchDocument } from "../types";

export function getProjectIdFromDocument(document: WorkbenchDocument | null) {
  if (!document) {
    return null;
  }

  if (document.kind === "project" || document.kind === "projectTask" || document.kind === "projectLog") {
    return document.projectId;
  }

  return null;
}

export function useProjectSelection(
  activeDocument: PaneComponentProps["activeDocument"],
  workbenchApi: PaneComponentProps["api"],
  availableProjects: ProjectSummary[]
) {
  const activeProjectId = getProjectIdFromDocument(activeDocument);
  const [projects, setProjects] = useState<ProjectSummary[]>(availableProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(activeProjectId);
  const [loadingProjects, setLoadingProjects] = useState(availableProjects.length === 0);
  const selectedProjectIdRef = useRef<string | null>(selectedProjectId);
  const showError = workbenchApi.showError;

  const syncSelectedProject = useCallback((projectId: string | null) => {
    selectedProjectIdRef.current = projectId;
    setSelectedProjectId(projectId);
    storeProjectId(projectId);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const payload = await api.listProjects();
      setProjects(payload.projects);
      const nextProjectId = resolveSelectedProjectId(
        payload.projects,
        activeProjectId ?? selectedProjectIdRef.current
      );
      syncSelectedProject(nextProjectId);
      showError(null);
      return payload.projects;
    } catch (error) {
      showError((error as Error).message);
      return [];
    } finally {
      setLoadingProjects(false);
    }
  }, [activeProjectId, showError, syncSelectedProject]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    setProjects(availableProjects);
    setLoadingProjects(false);
    const nextProjectId = resolveSelectedProjectId(
      availableProjects,
      activeProjectId ?? selectedProjectIdRef.current
    );
    syncSelectedProject(nextProjectId);
  }, [activeProjectId, availableProjects, syncSelectedProject]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (activeProjectId && activeProjectId !== selectedProjectId) {
      syncSelectedProject(activeProjectId);
    }
  }, [activeProjectId, selectedProjectId, syncSelectedProject]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  return {
    loadProjects,
    loadingProjects,
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId: syncSelectedProject
  };
}

export async function promptCreateProject(workbenchApi: PaneComponentProps["api"]) {
  const title = window.prompt("Project title");
  if (!title?.trim()) {
    return null;
  }

  workbenchApi.setBusy(`Creating ${title.trim()}...`);
  try {
    const payload = await api.createProject({ title: title.trim() });
    storeProjectId(payload.value.id);
    workbenchApi.showError(null);
    return payload;
  } catch (error) {
    workbenchApi.showError((error as Error).message);
    return null;
  } finally {
    workbenchApi.setBusy(null);
  }
}
