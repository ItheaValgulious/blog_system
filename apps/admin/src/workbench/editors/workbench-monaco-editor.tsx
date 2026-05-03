import type { WorkbenchEditorComponentProps } from "../types";
import { MonacoMarkdownEditor } from "./monaco-markdown-editor";

export function WorkbenchMonacoEditor(props: WorkbenchEditorComponentProps) {
  return (
    <MonacoMarkdownEditor
      editorKey={`${props.document.id}:${props.document.editorId}`}
      language={props.document.language}
      onChange={props.onChange}
      onMount={props.onMount}
      path={props.path}
      value={props.value}
    />
  );
}
