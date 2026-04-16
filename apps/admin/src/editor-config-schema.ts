import { keybindingSchema, renderConfigSchema, snippetSchema } from "@blog-system/content-core";

const siteConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["siteTitle", "theme", "enabledPlugins"],
  properties: {
    siteTitle: { type: "string", minLength: 1 },
    siteDescription: { type: "string" },
    backgroundImage: { type: "string" },
    theme: { type: "string", minLength: 1 },
    enabledPlugins: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true
    },
    about: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        body: { type: "string" }
      }
    }
  }
} as const;

const siteThemeConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["colors"],
  properties: {
    backgroundImage: { type: "string" },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["accent", "accentAlt", "background", "foreground", "line", "muted", "paper", "shadow"],
      properties: {
        accent: { type: "string", minLength: 1 },
        accentAlt: { type: "string", minLength: 1 },
        background: { type: "string", minLength: 1 },
        foreground: { type: "string", minLength: 1 },
        line: { type: "string", minLength: 1 },
        muted: { type: "string", minLength: 1 },
        paper: { type: "string", minLength: 1 },
        shadow: { type: "string", minLength: 1 }
      }
    }
  }
} as const;

export const jsonSchemas = {
  snippetSchema,
  keybindingSchema,
  renderConfigSchema,
  siteConfigSchema,
  siteThemeConfigSchema
};
