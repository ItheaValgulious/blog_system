import type { PluginDefinition } from "../types";

export const snippetActionsPlugin: PluginDefinition = {
  id: "snippet-actions",
  label: "Snippet Actions",
  description: "Handles tab and enter based snippet expansion inside the editor.",
  activate(context) {
    context.registerEditorAction({
      id: "editor.expandMatchingSnippet",
      title: "Editor: Expand Matching Snippet",
      handler({ activeSnippetMatches, editor, monaco, activeDocument }) {
        if (
          !activeDocument ||
          (activeDocument.kind !== "article" &&
            activeDocument.kind !== "projectTask" &&
            activeDocument.kind !== "projectLog")
        ) {
          return false;
        }

        const model = editor.getModel();
        const position = editor.getPosition();

        if (!model || !position) {
          return false;
        }

        const linePrefix = model.getValueInRange(
          new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column)
        );
        const matchedEntry = activeSnippetMatches
          .filter(
            (entry) =>
              entry.replacementText === entry.prefix && linePrefix.endsWith(entry.replacementText)
          )
          .sort((left, right) => right.prefix.length - left.prefix.length)[0];

        if (!matchedEntry) {
          return false;
        }

        const range = new monaco.Range(
          position.lineNumber,
          position.column - matchedEntry.prefix.length,
          position.lineNumber,
          position.column
        );

        editor.setSelection(range);
        const controller = editor.getContribution("snippetController2") as {
          insert: (template: string) => void;
        } | null;

        if (!controller) {
          return false;
        }

        const body = Array.isArray(matchedEntry.snippet.body)
          ? matchedEntry.snippet.body.join("\n")
          : matchedEntry.snippet.body;

        controller.insert(body);
        return true;
      }
    });
  }
};
