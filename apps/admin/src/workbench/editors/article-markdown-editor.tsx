import type { WorkbenchEditorComponentProps } from "../types";
import { WorkbenchMonacoEditor } from "./workbench-monaco-editor";

export function ArticleMarkdownEditor(props: WorkbenchEditorComponentProps) {
  return <WorkbenchMonacoEditor {...props} />;
}
