import type * as monacoEditor from "monaco-editor";

import { WorkbenchMonacoEditor } from "./workbench-monaco-editor";
import type { WorkbenchEditorComponentProps } from "../types";

interface CodeTextEditorProps extends WorkbenchEditorComponentProps {
  beforeMount?: (monaco: typeof monacoEditor) => void;
}

export function CodeTextEditor(props: CodeTextEditorProps) {
  return <WorkbenchMonacoEditor {...props} />;
}
