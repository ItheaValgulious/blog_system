import { HomeDashboard } from "../../home-dashboard";

import type { WorkbenchEditorComponentProps } from "../types";

export function HomeDashboardEditor({
  api: workbenchApi,
  adminHomeValue,
  homeWidgets,
  onChangeHomeConfig
}: WorkbenchEditorComponentProps) {
  if (!adminHomeValue) {
    return <div className="empty-editor">Loading admin home...</div>;
  }

  return (
    <HomeDashboard
      onChange={onChangeHomeConfig}
      value={adminHomeValue}
      widgets={homeWidgets}
      workbenchApi={workbenchApi}
    />
  );
}
