import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectSummary } from "@blog-system/content-core";

import { api } from "../../api";

import {
  resolveSelectedProjectId,
  storeProjectId
} from "../project-utils";
import type { PaneComponentProps, WorkbenchApi, WorkbenchDocument } from "../types";

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

async function requestProjectTextInput(
  workbenchApi: WorkbenchApi,
  options: {
    confirmLabel: string;
    defaultValue?: string;
    description?: string;
    label: string;
    overline: string;
    placeholder?: string;
    title: string;
  }
) {
  const value = await workbenchApi.requestTextInput({
    confirmLabel: options.confirmLabel,
    defaultValue: options.defaultValue,
    description: options.description,
    label: options.label,
    overline: options.overline,
    placeholder: options.placeholder,
    title: options.title
  });

  return value?.trim() || null;
}

export async function promptCreateProject(workbenchApi: PaneComponentProps["api"]) {
  const title = await requestProjectTextInput(workbenchApi, {
    confirmLabel: "Create Project",
    label: "Project Title",
    overline: "Project",
    placeholder: "Project Alpha",
    title: "New Project"
  });
  if (!title) {
    return null;
  }

  workbenchApi.setBusy(`Creating ${title}...`);
  try {
    const payload = await api.createProject({ title });
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

export async function promptCreateProjectTaskTitle(workbenchApi: PaneComponentProps["api"]) {
  return requestProjectTextInput(workbenchApi, {
    confirmLabel: "Create Task",
    label: "Task Title",
    overline: "Project Task",
    placeholder: "Ship the first draft",
    title: "New Task"
  });
}

export async function promptCreateProjectLogType(workbenchApi: PaneComponentProps["api"]) {
  return requestProjectTextInput(workbenchApi, {
    confirmLabel: "Create Event",
    defaultValue: "note",
    label: "Event Type",
    overline: "Project Log",
    placeholder: "note",
    title: "New Event"
  });
}
