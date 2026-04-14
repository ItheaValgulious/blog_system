import type { PluginDefinition } from "../types";

export const createMetadataPlugin: PluginDefinition = {
  id: "create-metadata",
  label: "Create Metadata",
  description: "Extends create dialogs with title and tag metadata for files and folders.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "create-metadata-fields",
      kind: "create-dialog",
      fields: [
        {
          id: "tags",
          label: "Tags",
          appliesTo: "both",
          input: "tags",
          defaultValue: "",
          placeholder: "tag-a, tag-b"
        }
      ]
    });
  }
};
