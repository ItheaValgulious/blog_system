import type { WorkbenchEditorComponentProps } from "../types";
import { WorkbenchMonacoEditor } from "./workbench-monaco-editor";

export function CodeTextEditor(props: WorkbenchEditorComponentProps) {
  return <WorkbenchMonacoEditor {...props} />;
}
