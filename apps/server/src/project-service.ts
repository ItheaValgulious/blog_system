import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  PROJECT_RECENT_ACTIVITY_WINDOW_DAYS,
  extractProjectResourceIds,
  isProjectTaskCompletedStatus,
  normalizeProjectId,
  parseProjectLogRecord,
  parseProjectRecord,
  parseProjectResourceRecord,
  parseProjectTaskRecord,
  serializeProjectLogRecord,
  serializeProjectRecord,
  serializeProjectResourceRecord,
  serializeProjectTaskRecord,
  type ProjectLogRecord,
  type ProjectRecord,
  type ProjectResourceRecord,
  type ProjectResourceType,
  type ProjectStats,
  type ProjectSummary,
  type ProjectTaskRecord
} from "@blog-system/content-core";

interface ProjectPaths {
  directory: string;
  logsDirectory: string;
  projectFile: string;
  resourcesDirectory: string;
  resourcesFilesDirectory: string;
  tasksDirectory: string;
}

export interface ProjectDocumentPayload {
  raw: string;
  value: ProjectSummary;
}

export interface ProjectTaskPayload {
  projectId: string;
  raw: string;
  value: ProjectTaskRecord;
}

export interface ProjectLogPayload {
  projectId: string;
  raw: string;
  value: ProjectLogRecord;
}

export interface ProjectResourcePayload {
  projectId: string;
  value: ProjectResourceRecord;
}

export interface DeleteProjectPayload {
  projectId: string;
}

export interface CreateProjectResourceInput {
  description?: string;
  file?: {
    base64Data: string;
    fileName: string;
  };
  source?: string;
  title?: string;
  type: ProjectResourceType;
}

function resolveProjectsPath(projectsRoot: string, ...segments: string[]) {
  const absoluteRoot = path.resolve(projectsRoot);
  const resolved = path.resolve(absoluteRoot, ...segments);

  if (!resolved.startsWith(absoluteRoot)) {
    throw new Error("Path escapes the projects root.");
  }

  return resolved;
}

function getProjectPaths(projectsRoot: string, projectId: string): ProjectPaths {
  const normalizedProjectId = normalizeProjectId(projectId);
  const directory = resolveProjectsPath(projectsRoot, normalizedProjectId);

  return {
    directory,
    logsDirectory: path.join(directory, "logs"),
    projectFile: path.join(directory, "project.json"),
    resourcesDirectory: path.join(directory, "resources"),
    resourcesFilesDirectory: path.join(directory, "resources", "files"),
    tasksDirectory: path.join(directory, "tasks")
  };
}

function createTimestampId(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${randomUUID().slice(0, 6)}`;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFileName(value: string) {
  const trimmed = value.trim().replace(/[\\/]+/g, "-");
  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "") || "file";
}

function compareIsoDateDesc(left: string, right: string) {
  return right.localeCompare(left);
}

function buildProjectStats(tasks: ProjectTaskRecord[], logs: ProjectLogRecord[]): ProjectStats {
  const cutoff = Date.now() - PROJECT_RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return {
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => isProjectTaskCompletedStatus(task.status)).length,
    recentActivityCount: logs.filter((log) => {
      const timestamp = Date.parse(log.occurredAt || log.updatedAt || log.createdAt);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    }).length
  };
}

async function fileExists(absolutePath: string) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function ensureProjectsRoot(projectsRoot: string) {
  await fs.mkdir(projectsRoot, { recursive: true });
}

async function ensureProjectStructure(projectsRoot: string, projectId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  await fs.mkdir(paths.directory, { recursive: true });
  await fs.mkdir(paths.tasksDirectory, { recursive: true });
  await fs.mkdir(paths.logsDirectory, { recursive: true });
  await fs.mkdir(paths.resourcesDirectory, { recursive: true });
  await fs.mkdir(paths.resourcesFilesDirectory, { recursive: true });
  return paths;
}

async function readDirectoryFiles(directory: string, extension: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readRawFile(absolutePath: string) {
  return fs.readFile(absolutePath, "utf8");
}

async function readProjectValue(projectsRoot: string, projectId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  const raw = await readRawFile(paths.projectFile);
  return {
    raw,
    value: parseProjectRecord(projectId, raw)
  };
}

async function readProjectTasks(projectsRoot: string, projectId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  const files = await readDirectoryFiles(paths.tasksDirectory, ".md");
  const tasks = await Promise.all(
    files.map(async (fileName) => {
      const taskId = fileName.replace(/\.md$/i, "");
      const raw = await readRawFile(path.join(paths.tasksDirectory, fileName));
      return parseProjectTaskRecord(taskId, raw);
    })
  );

  return tasks.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    if (left.updatedAt !== right.updatedAt) {
      return compareIsoDateDesc(left.updatedAt, right.updatedAt);
    }

    return left.title.localeCompare(right.title);
  });
}

async function readProjectLogs(projectsRoot: string, projectId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  const files = await readDirectoryFiles(paths.logsDirectory, ".md");
  const logs = await Promise.all(
    files.map(async (fileName) => {
      const logId = fileName.replace(/\.md$/i, "");
      const raw = await readRawFile(path.join(paths.logsDirectory, fileName));
      return parseProjectLogRecord(logId, raw);
    })
  );

  return logs.sort((left, right) => {
    const leftKey = left.occurredAt || left.updatedAt || left.createdAt;
    const rightKey = right.occurredAt || right.updatedAt || right.createdAt;

    if (leftKey !== rightKey) {
      return compareIsoDateDesc(leftKey, rightKey);
    }

    return left.id.localeCompare(right.id);
  });
}

async function readProjectResources(projectsRoot: string, projectId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  const files = await readDirectoryFiles(paths.resourcesDirectory, ".json");
  const resources = await Promise.all(
    files.map(async (fileName) => {
      const resourceId = fileName.replace(/\.json$/i, "");
      const raw = await readRawFile(path.join(paths.resourcesDirectory, fileName));
      return parseProjectResourceRecord(resourceId, raw);
    })
  );

  return resources.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return compareIsoDateDesc(left.updatedAt, right.updatedAt);
    }

    return left.title.localeCompare(right.title);
  });
}

async function createUniqueProjectId(projectsRoot: string, baseValue: string) {
  const baseId = normalizeProjectId(baseValue);
  let nextId = baseId;
  let index = 2;

  while (await fileExists(getProjectPaths(projectsRoot, nextId).directory)) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }

  return nextId;
}

async function createUniqueEntryId(directory: string, baseValue: string, extension: ".json" | ".md") {
  const baseId = normalizeProjectId(baseValue);
  let nextId = baseId;
  let index = 2;

  while (await fileExists(path.join(directory, `${nextId}${extension}`))) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }

  return nextId;
}

function buildProjectSummary(record: ProjectRecord, stats: ProjectStats): ProjectSummary {
  return {
    ...record,
    ...stats
  };
}

function buildProjectTaskTemplate(taskId: string, title: string, order: number) {
  const now = new Date().toISOString();
  return serializeProjectTaskRecord({
    id: taskId,
    title,
    status: "todo",
    order,
    startDate: getTodayDate(),
    dueDate: "",
    createdAt: now,
    updatedAt: now,
    resourceIds: [],
    body: `# ${title}\n`,
    rawContent: "",
    excerpt: ""
  });
}

function buildProjectLogTemplate(logId: string, type: string) {
  const now = new Date().toISOString();
  return serializeProjectLogRecord({
    id: logId,
    type,
    taskIds: [],
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    resourceIds: [],
    body: "",
    rawContent: "",
    excerpt: "",
    title: ""
  });
}

export async function listProjects(projectsRoot: string) {
  await ensureProjectsRoot(projectsRoot);
  const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  const projects: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectId = normalizeProjectId(entry.name);
    const paths = getProjectPaths(projectsRoot, projectId);
    if (!(await fileExists(paths.projectFile))) {
      continue;
    }

    const { value } = await readProjectValue(projectsRoot, projectId);
    const [tasks, logs] = await Promise.all([
      readProjectTasks(projectsRoot, projectId),
      readProjectLogs(projectsRoot, projectId)
    ]);
    projects.push(buildProjectSummary(value, buildProjectStats(tasks, logs)));
  }

  return {
    projects: projects.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return compareIsoDateDesc(left.updatedAt, right.updatedAt);
      }

      return left.title.localeCompare(right.title);
    })
  };
}

export async function createProject(
  projectsRoot: string,
  input: {
    goal?: string;
    targetDate?: string;
    title: string;
  }
) {
  await ensureProjectsRoot(projectsRoot);
  const title = input.title.trim();
  if (!title) {
    throw new Error("Project title is required.");
  }

  const projectId = await createUniqueProjectId(projectsRoot, title);
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  const now = new Date().toISOString();
  const record: ProjectRecord = {
    id: projectId,
    title,
    status: "active",
    goal: input.goal?.trim() ?? "",
    startDate: getTodayDate(),
    targetDate: input.targetDate?.trim() ?? "",
    createdAt: now,
    updatedAt: now
  };

  await fs.writeFile(paths.projectFile, serializeProjectRecord(record), "utf8");
  return readProject(projectsRoot, projectId);
}

export async function readProject(projectsRoot: string, projectId: string): Promise<ProjectDocumentPayload> {
  const { raw, value } = await readProjectValue(projectsRoot, projectId);
  const [tasks, logs] = await Promise.all([
    readProjectTasks(projectsRoot, projectId),
    readProjectLogs(projectsRoot, projectId)
  ]);

  return {
    raw,
    value: buildProjectSummary(value, buildProjectStats(tasks, logs))
  };
}

export async function saveProject(projectsRoot: string, projectId: string, raw: string) {
  const existing = await readProjectValue(projectsRoot, projectId).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  });
  const parsed = parseProjectRecord(projectId, raw);
  const now = new Date().toISOString();
  const nextRecord: ProjectRecord = {
    ...parsed,
    id: normalizeProjectId(projectId),
    createdAt: existing?.value.createdAt || now,
    updatedAt: now,
    startDate: parsed.startDate || existing?.value.startDate || getTodayDate()
  };
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  await fs.writeFile(paths.projectFile, serializeProjectRecord(nextRecord), "utf8");
  return readProject(projectsRoot, projectId);
}

export async function deleteProject(projectsRoot: string, projectId: string): Promise<DeleteProjectPayload> {
  const paths = getProjectPaths(projectsRoot, projectId);
  await fs.rm(paths.directory, {
    force: false,
    recursive: true
  });

  return {
    projectId: normalizeProjectId(projectId)
  };
}

export async function listProjectTasks(projectsRoot: string, projectId: string) {
  await ensureProjectStructure(projectsRoot, projectId);
  return {
    projectId: normalizeProjectId(projectId),
    tasks: await readProjectTasks(projectsRoot, projectId)
  };
}

export async function createProjectTask(projectsRoot: string, projectId: string, title: string) {
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Task title is required.");
  }

  const existingTasks = await readProjectTasks(projectsRoot, projectId);
  const taskId = await createUniqueEntryId(paths.tasksDirectory, trimmedTitle, ".md");
  const raw = buildProjectTaskTemplate(
    taskId,
    trimmedTitle,
    existingTasks.reduce((max, task) => Math.max(max, task.order), 0) + 1
  );

  await fs.writeFile(path.join(paths.tasksDirectory, `${taskId}.md`), raw, "utf8");
  return readProjectTask(projectsRoot, projectId, taskId);
}

export async function readProjectTask(
  projectsRoot: string,
  projectId: string,
  taskId: string
): Promise<ProjectTaskPayload> {
  const paths = getProjectPaths(projectsRoot, projectId);
  const normalizedTaskId = normalizeProjectId(taskId);
  const raw = await readRawFile(path.join(paths.tasksDirectory, `${normalizedTaskId}.md`));

  return {
    projectId: normalizeProjectId(projectId),
    raw,
    value: parseProjectTaskRecord(normalizedTaskId, raw)
  };
}

export async function saveProjectTask(
  projectsRoot: string,
  projectId: string,
  taskId: string,
  raw: string
) {
  const normalizedTaskId = normalizeProjectId(taskId);
  const existing = await readProjectTask(projectsRoot, projectId, normalizedTaskId).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  );
  const parsed = parseProjectTaskRecord(normalizedTaskId, raw);
  const now = new Date().toISOString();
  const nextRecord: ProjectTaskRecord = {
    ...parsed,
    id: normalizedTaskId,
    createdAt: existing?.value.createdAt || now,
    updatedAt: now,
    resourceIds: extractProjectResourceIds(parsed.body),
    order: parsed.order || existing?.value.order || 1
  };
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  await fs.writeFile(
    path.join(paths.tasksDirectory, `${normalizedTaskId}.md`),
    serializeProjectTaskRecord(nextRecord),
    "utf8"
  );
  return readProjectTask(projectsRoot, projectId, normalizedTaskId);
}

export async function listProjectLogs(projectsRoot: string, projectId: string) {
  await ensureProjectStructure(projectsRoot, projectId);
  return {
    logs: await readProjectLogs(projectsRoot, projectId),
    projectId: normalizeProjectId(projectId)
  };
}

export async function createProjectLog(
  projectsRoot: string,
  projectId: string,
  input?: { type?: string }
) {
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  const type = input?.type?.trim() || "note";
  const logId = createTimestampId("event");
  const raw = buildProjectLogTemplate(logId, type);
  await fs.writeFile(path.join(paths.logsDirectory, `${logId}.md`), raw, "utf8");
  return readProjectLog(projectsRoot, projectId, logId);
}

export async function readProjectLog(
  projectsRoot: string,
  projectId: string,
  logId: string
): Promise<ProjectLogPayload> {
  const paths = getProjectPaths(projectsRoot, projectId);
  const normalizedLogId = normalizeProjectId(logId);
  const raw = await readRawFile(path.join(paths.logsDirectory, `${normalizedLogId}.md`));

  return {
    projectId: normalizeProjectId(projectId),
    raw,
    value: parseProjectLogRecord(normalizedLogId, raw)
  };
}

export async function saveProjectLog(
  projectsRoot: string,
  projectId: string,
  logId: string,
  raw: string
) {
  const normalizedLogId = normalizeProjectId(logId);
  const existing = await readProjectLog(projectsRoot, projectId, normalizedLogId).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  );
  const parsed = parseProjectLogRecord(normalizedLogId, raw);
  const now = new Date().toISOString();
  const nextRecord: ProjectLogRecord = {
    ...parsed,
    id: normalizedLogId,
    createdAt: existing?.value.createdAt || now,
    updatedAt: now,
    occurredAt: parsed.occurredAt || existing?.value.occurredAt || now,
    resourceIds: extractProjectResourceIds(parsed.body)
  };
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  await fs.writeFile(
    path.join(paths.logsDirectory, `${normalizedLogId}.md`),
    serializeProjectLogRecord(nextRecord),
    "utf8"
  );
  return readProjectLog(projectsRoot, projectId, normalizedLogId);
}

export async function listProjectResources(projectsRoot: string, projectId: string) {
  await ensureProjectStructure(projectsRoot, projectId);
  return {
    projectId: normalizeProjectId(projectId),
    resources: await readProjectResources(projectsRoot, projectId)
  };
}

export async function createProjectResource(
  projectsRoot: string,
  projectId: string,
  input: CreateProjectResourceInput
): Promise<ProjectResourcePayload> {
  const paths = await ensureProjectStructure(projectsRoot, projectId);
  const baseName = input.title?.trim() || input.file?.fileName?.trim() || createTimestampId("resource");
  const resourceId = await createUniqueEntryId(paths.resourcesDirectory, baseName, ".json");
  const now = new Date().toISOString();
  let fileName = "";
  let filePath = "";

  if (input.file) {
    fileName = input.file.fileName.trim() || "file";
    const storedFileName = `${resourceId}-${sanitizeFileName(fileName)}`;
    filePath = `resources/files/${storedFileName}`;
    await fs.writeFile(
      resolveProjectsPath(projectsRoot, projectId, filePath),
      Buffer.from(input.file.base64Data, "base64")
    );
  }

  const record: ProjectResourceRecord = {
    id: resourceId,
    type: input.type,
    title: input.title?.trim() || fileName || resourceId,
    source: input.source?.trim() ?? "",
    description: input.description?.trim() ?? "",
    fileName,
    filePath,
    createdAt: now,
    updatedAt: now
  };

  await fs.writeFile(
    path.join(paths.resourcesDirectory, `${resourceId}.json`),
    serializeProjectResourceRecord(record),
    "utf8"
  );

  return {
    projectId: normalizeProjectId(projectId),
    value: record
  };
}

export async function deleteProjectResource(projectsRoot: string, projectId: string, resourceId: string) {
  const paths = getProjectPaths(projectsRoot, projectId);
  const normalizedResourceId = normalizeProjectId(resourceId);
  const metadataPath = path.join(paths.resourcesDirectory, `${normalizedResourceId}.json`);
  const raw = await readRawFile(metadataPath);
  const record = parseProjectResourceRecord(normalizedResourceId, raw);

  if (record.filePath) {
    await fs.rm(resolveProjectsPath(projectsRoot, projectId, record.filePath), {
      force: true,
      recursive: false
    });
  }

  await fs.rm(metadataPath, {
    force: false,
    recursive: false
  });

  return {
    projectId: normalizeProjectId(projectId),
    resourceId: normalizedResourceId
  };
}
