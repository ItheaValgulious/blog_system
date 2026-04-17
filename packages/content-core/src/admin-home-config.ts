export interface AdminHomeConfig {
  widgetOrder: string[];
  widgets: Record<string, unknown>;
}

export const adminHomeConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["widgetOrder", "widgets"],
  properties: {
    widgetOrder: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true
    },
    widgets: {
      type: "object",
      additionalProperties: true
    }
  }
} as const;

export const defaultAdminHomeConfig: AdminHomeConfig = {
  widgetOrder: [],
  widgets: {}
};

export function normalizeAdminHomeConfig(
  input: Partial<AdminHomeConfig> | null | undefined
): AdminHomeConfig {
  return {
    widgetOrder: (Array.isArray(input?.widgetOrder) ? input.widgetOrder : [])
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .filter((entry, index, entries) => entries.indexOf(entry) === index),
    widgets: input?.widgets && typeof input.widgets === "object" && !Array.isArray(input.widgets)
      ? input.widgets
      : {}
  };
}
