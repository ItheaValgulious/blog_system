import type { PluginDefinition } from "../types";
import {
  PROJECT_MODULE_ID,
  PROJECT_OVERVIEW_PANE_ID
} from "../project-utils";
import { ProjectLogEditor, ProjectOverviewEditor, ProjectTaskEditor } from "../editors/project-editors";
import { ProjectOverviewPane } from "../panes/project-overview-pane";
import { promptCreateProject } from "../panes/project-pane-shared";

export const projectPlugin: PluginDefinition = {
  id: "project-module",
  label: "Project",
  description: "Adds a first-party project workspace with a unified overview editor.",
  activate(context) {
    context.registerWorkbenchContribution({
      icon: "project",
      id: "project-module-entry",
      kind: "module",
      moduleId: PROJECT_MODULE_ID,
      order: 16,
      title: "Project"
    });
    context.registerWorkbenchContribution({
      component: ProjectOverviewPane,
      defaultGroupId: PROJECT_MODULE_ID,
      id: "project-overview-pane",
      kind: "pane",
      paneId: PROJECT_OVERVIEW_PANE_ID,
      tabLabel: "Project",
      title: "Project"
    });
    context.registerEditorContribution({
      canHandle: (document) => document.kind === "project",
      component: ProjectOverviewEditor,
      editorId: "project.overview",
      label: "Project Overview",
      matches: (document) => document.kind === "project"
    });
    context.registerEditorContribution({
      canHandle: (document) => document.kind === "projectTask",
      component: ProjectTaskEditor,
      editorId: "project.task-markdown",
      label: "Project Task",
      matches: (document) => document.kind === "projectTask"
    });
    context.registerEditorContribution({
      canHandle: (document) => document.kind === "projectLog",
      component: ProjectLogEditor,
      editorId: "project.log-markdown",
      label: "Project Log",
      matches: (document) => document.kind === "projectLog"
    });
    context.registerCommand({
      id: "project.openModule",
      title: "Project: Open Module",
      keywords: ["project", "tasks", "logs", "resources"],
      handler(api) {
        api.showSidebarModule(PROJECT_MODULE_ID, PROJECT_OVERVIEW_PANE_ID);
      }
    });
    context.registerCommand({
      id: "project.createProject",
      title: "Project: Create Project",
      keywords: ["project", "new", "create"],
      async handler(api) {
        const payload = await promptCreateProject(api);
        if (!payload) {
          return;
        }

        await api.refreshWorkspaceData("projects");
        api.showSidebarModule(PROJECT_MODULE_ID, PROJECT_OVERVIEW_PANE_ID);
        await api.openResource({
          kind: "project",
          projectId: payload.value.id
        });
      }
    });
  }
};
