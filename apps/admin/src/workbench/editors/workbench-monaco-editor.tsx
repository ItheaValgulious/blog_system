import Editor from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

import type { WorkbenchEditorComponentProps } from "../types";

interface WorkbenchMonacoEditorProps extends WorkbenchEditorComponentProps {
  beforeMount?: (monaco: typeof monacoEditor) => void;
}

export function WorkbenchMonacoEditor({
  beforeMount,
  document,
  onChange,
  onMount,
  path,
  value
}: WorkbenchMonacoEditorProps) {
  return (
    <Editor
      key={`${document.id}:${document.editorId}`}
      beforeMount={beforeMount}
      defaultLanguage={document.language}
      defaultValue={value}
      language={document.language}
      onMount={onMount}
      options={{
        automaticLayout: true,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: false },
        quickSuggestions: { other: true, strings: true, comments: false },
        smoothScrolling: true,
        snippetSuggestions: "top",
        tabCompletion: "on",
        wordWrap: "on"
      }}
      path={path}
      onChange={(nextValue) => {
        onChange(nextValue ?? "");
      }}
    />
  );
}
