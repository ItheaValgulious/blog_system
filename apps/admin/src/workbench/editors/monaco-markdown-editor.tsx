import Editor from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

interface MonacoMarkdownEditorProps {
  editorKey?: string;
  language?: string;
  onChange: (nextValue: string) => void;
  onMount: (
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    monaco: typeof monacoEditor
  ) => void;
  path: string;
  value: string;
}

export function MonacoMarkdownEditor({
  editorKey,
  language = "markdown",
  onChange,
  onMount,
  path,
  value
}: MonacoMarkdownEditorProps) {
  return (
    <Editor
      key={editorKey ?? `${path}:${language}`}
      defaultLanguage={language}
      defaultValue={value}
      language={language}
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
