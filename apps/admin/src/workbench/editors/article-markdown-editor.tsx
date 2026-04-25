import type * as monacoEditor from "monaco-editor";

import { WorkbenchMonacoEditor } from "./workbench-monaco-editor";
import type { WorkbenchEditorComponentProps } from "../types";

interface ArticleMarkdownEditorProps extends WorkbenchEditorComponentProps {
  beforeMount?: (monaco: typeof monacoEditor) => void;
}

export function ArticleMarkdownEditor(props: ArticleMarkdownEditorProps) {
  return <WorkbenchMonacoEditor {...props} />;
}
