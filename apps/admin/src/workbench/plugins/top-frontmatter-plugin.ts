import type { PluginDefinition } from "../types";

export const topFrontmatterPlugin: PluginDefinition = {
  id: "top-frontmatter",
  label: "Top Frontmatter",
  description: "Adds the top frontmatter field and sorting priority metadata for new articles.",
  activate(context) {
    context.registerWorkbenchContribution({
      id: "top-frontmatter-field",
      kind: "create-dialog",
      fields: [
        {
          id: "top",
          label: "Top",
          appliesTo: "file",
          input: "number",
          defaultValue: "0",
          placeholder: "0"
        }
      ]
    });
  }
};
