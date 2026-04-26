import { dump, load } from "js-yaml";

import { titleFromMarkdownBody } from "./utils.js";

export const PROJECT_RECENT_ACTIVITY_WINDOW_DAYS = 7;

export const PROJECT_STATUS_VALUES = ["active", "archived", "completed"] as const;
export const PROJECT_TASK_STATUS_VALUES = ["todo", "completed", "failed"] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUS_VALUES)[number];
export type ProjectLogType = string;

export interface ProjectRecord {
  id: string;
  title: string;
  status: ProjectStatus;
  goal: string;
  startDate: string;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTaskRecord {
  id: string;
  title: string;
  status: ProjectTaskStatus;
  order: number;
  startDate: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  rawContent: string;
  excerpt: string;
}

export interface ProjectLogRecord {
  id: string;
  type: ProjectLogType;
  taskIds: string[];
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  rawContent: string;
  excerpt: string;
  title: string;
}

export interface ProjectStats {
  taskCount: number;
  completedTaskCount: number;
  recentActivityCount: number;
}

export interface ProjectSummary extends ProjectRecord, ProjectStats {}

type MarkdownFrontmatter = Record<string, unknown>;

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.trunc(parsed);
}

function parseFrontmatterBlock(rawContent: string) {
  const normalizedRaw = normalizeLineEndings(rawContent);

  if (!normalizedRaw.startsWith("---\n")) {
    return {
      content: normalizedRaw,
      data: {} as MarkdownFrontmatter
    };
  }

  const closingIndex = normalizedRaw.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      content: normalizedRaw,
      data: {} as MarkdownFrontmatter
    };
  }

  const rawFrontmatter = normalizedRaw.slice(4, closingIndex);
  const content = normalizedRaw.slice(closingIndex + 5);
  const loaded = load(rawFrontmatter);

  return {
    content,
    data: loaded && typeof loaded === "object" ? (loaded as MarkdownFrontmatter) : {}
  };
}

function serializeMarkdownRecord(frontmatter: MarkdownFrontmatter, body: string) {
  const yaml = dump(
    Object.fromEntries(Object.entries(frontmatter).filter(([, value]) => value !== undefined)),
    {
      lineWidth: 120,
      noRefs: true
    }
  ).trimEnd();
  const normalizedBody = normalizeLineEndings(body).replace(/^\n+/, "").replace(/\s+$/, "");

  return `---\n${yaml}\n---\n\n${normalizedBody}\n`;
}

function summarizeBody(body: string, maxLength = 180) {
  const normalized = normalizeLineEndings(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function parseJsonObject(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Project files must contain a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function titleFromId(id: string) {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeProjectTitle(value: unknown, fallbackId: string) {
  const normalized = normalizeString(value);
  return normalized || titleFromId(fallbackId);
}

function normalizeProjectTaskTitle(id: string, value: unknown, body: string) {
  const normalized = normalizeString(value);
  return normalized || titleFromMarkdownBody(body, `${id}.md`);
}

export function normalizeProjectStatus(value: unknown): ProjectStatus {
  switch (normalizeString(value).toLowerCase()) {
    case "archived":
      return "archived";
    case "completed":
      return "completed";
    default:
      return "active";
  }
}

export function normalizeProjectTaskStatus(value: unknown): ProjectTaskStatus {
  switch (normalizeString(value).toLowerCase()) {
    case "completed":
    case "done":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "todo";
  }
}

function normalizeProjectLogTitle(id: string, body: string, type: string) {
  const normalizedBody = normalizeLineEndings(body);
  const headingMatch = normalizedBody.match(/^#{1,6}\s+(.+)$/m);
  const firstLine = normalizedBody
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  if (firstLine) {
    return firstLine.replace(/^[-*]\s+/, "").slice(0, 80);
  }

  return type ? `${type} log ${id}` : `Log ${id}`;
}

export function normalizeProjectId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "project";
}

export function isProjectTaskCompletedStatus(status: string) {
  return normalizeProjectTaskStatus(status) === "completed";
}

export function parseProjectRecord(projectId: string, raw: string): ProjectRecord {
  const parsed = parseJsonObject(raw);

  return {
    id: normalizeProjectId(projectId),
    title: normalizeProjectTitle(parsed.title, projectId),
    status: normalizeProjectStatus(parsed.status),
    goal: normalizeString(parsed.goal),
    startDate: normalizeString(parsed.startDate),
    targetDate: normalizeString(parsed.targetDate),
    createdAt: normalizeString(parsed.createdAt),
    updatedAt: normalizeString(parsed.updatedAt)
  };
}

export function serializeProjectRecord(record: ProjectRecord) {
  return `${JSON.stringify(
    {
      id: record.id,
      title: record.title,
      status: record.status,
      goal: record.goal,
      startDate: record.startDate,
      targetDate: record.targetDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    },
    null,
    2
  )}\n`;
}

export function parseProjectTaskRecord(taskId: string, rawContent: string): ProjectTaskRecord {
  const parsed = parseFrontmatterBlock(rawContent);
  const body = normalizeLineEndings(parsed.content).replace(/^\n+/, "");
  const frontmatter = parsed.data;

  return {
    id: normalizeProjectId(normalizeString(frontmatter.id) || taskId),
    title: normalizeProjectTaskTitle(taskId, frontmatter.title, body),
    status: normalizeProjectTaskStatus(frontmatter.status),
    order: normalizeNumber(frontmatter.order),
    startDate: normalizeString(frontmatter.startDate),
    dueDate: normalizeString(frontmatter.dueDate),
    createdAt: normalizeString(frontmatter.createdAt),
    updatedAt: normalizeString(frontmatter.updatedAt),
    body,
    rawContent: normalizeLineEndings(rawContent),
    excerpt: summarizeBody(body)
  };
}

export function serializeProjectTaskRecord(record: ProjectTaskRecord) {
  const frontmatter: MarkdownFrontmatter = {
    id: record.id,
    title: record.title,
    status: record.status,
    order: record.order,
    startDate: record.startDate,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  return serializeMarkdownRecord(frontmatter, record.body);
}

export function parseProjectLogRecord(logId: string, rawContent: string): ProjectLogRecord {
  const parsed = parseFrontmatterBlock(rawContent);
  const body = normalizeLineEndings(parsed.content).replace(/^\n+/, "");
  const frontmatter = parsed.data;
  const type = normalizeString(frontmatter.type) || "note";

  return {
    id: normalizeProjectId(normalizeString(frontmatter.id) || logId),
    type,
    taskIds: uniqueStrings(normalizeStringArray(frontmatter.taskIds)),
    occurredAt: normalizeString(frontmatter.occurredAt),
    createdAt: normalizeString(frontmatter.createdAt),
    updatedAt: normalizeString(frontmatter.updatedAt),
    body,
    rawContent: normalizeLineEndings(rawContent),
    excerpt: summarizeBody(body),
    title: normalizeProjectLogTitle(logId, body, type)
  };
}

export function serializeProjectLogRecord(record: ProjectLogRecord) {
  const frontmatter: MarkdownFrontmatter = {
    id: record.id,
    type: record.type,
    taskIds: record.taskIds,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  return serializeMarkdownRecord(frontmatter, record.body);
}
