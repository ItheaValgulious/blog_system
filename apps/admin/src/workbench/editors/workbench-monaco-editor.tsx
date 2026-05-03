import type { WorkbenchEditorComponentProps } from "../types";
import { MonacoMarkdownEditor } from "./monaco-markdown-editor";

export function WorkbenchMonacoEditor(props: WorkbenchEditorComponentProps) {
  return (
    <MonacoMarkdownEditor
      onChange={props.onChange}
      onMount={props.onMount}
      path={props.path}
      value={props.value}
    />
  );
}
