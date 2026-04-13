#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runApplication } from "./.reference/stricli/packages/core/src/application/run.ts";
import {
  buildApplication,
  buildCommand,
  buildRouteMap,
  numberParser,
  text_en,
  type ApplicationText,
} from "./.reference/stricli/packages/core/src/index.ts";
import {
  TaskError,
  TaskwarriorLib,
  type Task,
  type TaskAnnotation,
  type TaskPriority,
  type TaskStatus,
} from "taskwarrior-lib";

type StoredTask = Task & Record<string, unknown>;

type UdaDefinition = {
  readonly name: string;
  readonly type?: string;
  readonly label?: string;
  readonly values?: readonly string[];
  readonly allowBlank?: boolean;
  readonly defaultValue?: string;
};

type TaskOutput = StoredTask & {
  readonly meta: {
    readonly active: boolean;
    readonly blocked: boolean;
    readonly blocking: boolean;
    readonly overdue: boolean;
    readonly ready: boolean;
  };
  readonly udas: Record<string, unknown>;
};

const COMMAND_NAME = "task-agent";

const EXIT_CODE = {
  validation: 1,
  notFound: 2,
  environment: 3,
  taskwarrior: 4,
} as const;

const STATUS_VALUES = ["pending", "waiting", "deleted", "completed", "recurring"] as const;
const OPEN_STATUS_VALUES = ["pending", "waiting"] as const;
const PRIORITY_VALUES = ["H", "M", "L"] as const;
const PRIORITY_FILTER_VALUES = ["H", "M", "L", "none"] as const;
const SORT_VALUES = ["entry", "modified", "due", "scheduled", "project", "priority", "description"] as const;
const MUTABLE_SCALAR_FIELDS = ["description", "project", "priority", "due", "wait", "scheduled", "until", "recur"] as const;
const CORE_TASK_FIELDS = new Set<string>([
  "id",
  "status",
  "uuid",
  "entry",
  "description",
  "start",
  "end",
  "due",
  "until",
  "wait",
  "modified",
  "scheduled",
  "recur",
  "mask",
  "imask",
  "parent",
  "project",
  "priority",
  "depends",
  "tags",
  "annotations",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, exitCode: number, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

function errorPayload(error: CliError): { ok: false; error: { code: string; message: string; details?: unknown } } {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

function toCliError(
  error: unknown,
  fallbackCode: string = "TASKWARRIOR_ERROR",
  fallbackExitCode: number = EXIT_CODE.taskwarrior,
): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof TaskError) {
    return new CliError(fallbackCode, error.message || "Taskwarrior command failed", fallbackExitCode);
  }

  if (error instanceof Error) {
    return new CliError(fallbackCode, error.message || "Command failed", fallbackExitCode);
  }

  return new CliError(fallbackCode, "Command failed", fallbackExitCode, { cause: error });
}

function formatErrorJson(
  error: unknown,
  fallbackCode: string = "TASKWARRIOR_ERROR",
  fallbackExitCode: number = EXIT_CODE.taskwarrior,
): string {
  return JSON.stringify(errorPayload(toCliError(error, fallbackCode, fallbackExitCode)));
}

function normalizeExitCode(exitCode: number): number {
  if (exitCode >= 0) {
    return exitCode;
  }

  if (exitCode === -4 || exitCode === -5) {
    return EXIT_CODE.validation;
  }

  if (exitCode === -3) {
    return EXIT_CODE.environment;
  }

  return EXIT_CODE.taskwarrior;
}

function determineExitCode(error: unknown): number {
  return toCliError(error).exitCode;
}

const appText: ApplicationText = {
  ...text_en,
  noCommandRegisteredForInput: ({ input, corrections }) => {
    return formatErrorJson(
      new CliError("UNKNOWN_COMMAND", `Unknown command '${input}'`, EXIT_CODE.validation, { corrections }),
      "UNKNOWN_COMMAND",
      EXIT_CODE.validation,
    );
  },
  noTextAvailableForLocale: ({ requestedLocale, defaultLocale }) => {
    return formatErrorJson(
      new CliError("UNSUPPORTED_LOCALE", `Unsupported locale '${requestedLocale}'`, EXIT_CODE.environment, {
        defaultLocale,
      }),
      "UNSUPPORTED_LOCALE",
      EXIT_CODE.environment,
    );
  },
  exceptionWhileParsingArguments: (error) => {
    return formatErrorJson(error, "INVALID_ARGUMENT", EXIT_CODE.validation);
  },
  exceptionWhileLoadingCommandFunction: (error) => {
    return formatErrorJson(error, "COMMAND_LOAD_ERROR", EXIT_CODE.taskwarrior);
  },
  exceptionWhileLoadingCommandContext: (error) => {
    return formatErrorJson(error, "CONTEXT_LOAD_ERROR", EXIT_CODE.environment);
  },
  exceptionWhileRunningCommand: (error) => {
    return formatErrorJson(error, "COMMAND_FAILED", EXIT_CODE.taskwarrior);
  },
  commandErrorResult: (error) => {
    return formatErrorJson(error, "COMMAND_FAILED", EXIT_CODE.taskwarrior);
  },
  currentVersionIsNotLatest: ({ currentVersion, latestVersion, upgradeCommand }) => {
    return JSON.stringify({
      ok: true,
      warning: {
        code: "NEW_VERSION_AVAILABLE",
        currentVersion,
        latestVersion,
        upgradeCommand,
      },
    });
  },
};

function createTaskwarrior(): TaskwarriorLib {
  return new TaskwarriorLib();
}

function ensureTaskBinary(): string {
  try {
    return execFileSync("task", ["_version"], { encoding: "utf8" }).trim();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new CliError(
        "TASK_BINARY_UNAVAILABLE",
        "Taskwarrior binary 'task' is not installed or not on PATH",
        EXIT_CODE.environment,
      );
    }

    throw new CliError(
      "TASK_BINARY_UNAVAILABLE",
      "Taskwarrior binary 'task' could not be executed",
      EXIT_CODE.environment,
    );
  }
}

function requireTaskwarrior(): { readonly version: string; readonly taskwarrior: TaskwarriorLib } {
  const version = ensureTaskBinary();
  return {
    version,
    taskwarrior: createTaskwarrior(),
  };
}

function trimTaskOutput(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function resolveCalc(taskwarrior: TaskwarriorLib, expression: string, field: string): string {
  try {
    const resolved = trimTaskOutput(taskwarrior.calc(expression));
    if (!resolved) {
      throw new CliError("INVALID_DATE_EXPRESSION", `Unable to resolve ${field}`, EXIT_CODE.validation, {
        expression,
        field,
      });
    }
    return resolved;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError("INVALID_DATE_EXPRESSION", `Unable to resolve ${field}`, EXIT_CODE.validation, {
      expression,
      field,
    });
  }
}

function parseTaskDate(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(trimmed);
  if (compact) {
    const year = compact[1];
    const month = compact[2];
    const day = compact[3];
    const hour = compact[4];
    const minute = compact[5];
    const second = compact[6];
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  const isoLike = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z)?$/.exec(trimmed);
  if (isoLike) {
    const year = isoLike[1];
    const month = isoLike[2];
    const day = isoLike[3];
    const hour = isoLike[4];
    const minute = isoLike[5];
    const second = isoLike[6];
    const zulu = isoLike[7] ?? "";
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${zulu}`);
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getNowEpoch(): number {
  return Date.now();
}

function isClosed(task: StoredTask): boolean {
  return task.status === "completed" || task.status === "deleted";
}

function getDepends(task: StoredTask): string[] {
  const depends = task.depends;
  if (!Array.isArray(depends)) {
    return [];
  }
  return depends.filter((value): value is string => typeof value === "string");
}

function getTags(task: StoredTask): string[] {
  const tags = task.tags;
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter((value): value is string => typeof value === "string");
}

function getAnnotations(task: StoredTask): TaskAnnotation[] {
  const annotations = task.annotations;
  if (!Array.isArray(annotations)) {
    return [];
  }
  return annotations.filter((value): value is TaskAnnotation => {
    return Boolean(value) && typeof value === "object" && typeof value.description === "string";
  });
}

function buildTaskIndex(tasks: readonly StoredTask[]): Map<string, StoredTask> {
  const index = new Map<string, StoredTask>();
  for (const task of tasks) {
    if (typeof task.uuid === "string" && task.uuid.length > 0) {
      index.set(task.uuid, task);
    }
  }
  return index;
}

function isBlocked(task: StoredTask, taskIndex: ReadonlyMap<string, StoredTask>): boolean {
  if (isClosed(task)) {
    return false;
  }

  return getDepends(task).some((uuid) => {
    const dependency = taskIndex.get(uuid);
    if (!dependency) {
      return true;
    }
    return !isClosed(dependency);
  });
}

function isBlocking(task: StoredTask, tasks: readonly StoredTask[]): boolean {
  const taskUuid = task.uuid;
  if (isClosed(task) || typeof taskUuid !== "string") {
    return false;
  }

  return tasks.some((candidate) => {
    if (candidate.uuid === taskUuid || isClosed(candidate)) {
      return false;
    }
    return getDepends(candidate).includes(taskUuid);
  });
}

function isActive(task: StoredTask): boolean {
  return !isClosed(task) && typeof task.start === "string" && task.start.length > 0;
}

function isWaiting(task: StoredTask, nowEpoch: number): boolean {
  if (task.status === "waiting") {
    return true;
  }

  const waitEpoch = parseTaskDate(task.wait);
  return task.status === "pending" && waitEpoch !== undefined && waitEpoch > nowEpoch;
}

function isReady(task: StoredTask, taskIndex: ReadonlyMap<string, StoredTask>, nowEpoch: number): boolean {
  if (task.status !== "pending") {
    return false;
  }

  if (isWaiting(task, nowEpoch) || isBlocked(task, taskIndex)) {
    return false;
  }

  const scheduledEpoch = parseTaskDate(task.scheduled);
  return scheduledEpoch === undefined || scheduledEpoch <= nowEpoch;
}

function isOverdue(task: StoredTask, nowEpoch: number): boolean {
  if (isClosed(task)) {
    return false;
  }

  const dueEpoch = parseTaskDate(task.due);
  return dueEpoch !== undefined && dueEpoch < nowEpoch;
}

function extractUdas(task: StoredTask): Record<string, unknown> {
  const udas: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(task)) {
    if (!CORE_TASK_FIELDS.has(key)) {
      udas[key] = value;
    }
  }
  return udas;
}

function enrichTask(task: StoredTask, tasks: readonly StoredTask[], taskIndex: ReadonlyMap<string, StoredTask>): TaskOutput {
  const nowEpoch = getNowEpoch();
  return {
    ...task,
    meta: {
      active: isActive(task),
      blocked: isBlocked(task, taskIndex),
      blocking: isBlocking(task, tasks),
      overdue: isOverdue(task, nowEpoch),
      ready: isReady(task, taskIndex, nowEpoch),
    },
    udas: extractUdas(task),
  };
}

function serializeTasks(tasks: readonly StoredTask[]): TaskOutput[] {
  const taskIndex = buildTaskIndex(tasks);
  return tasks.map((task) => enrichTask(task, tasks, taskIndex));
}

function serializeTask(task: StoredTask, snapshot: readonly StoredTask[]): TaskOutput {
  return enrichTask(task, snapshot, buildTaskIndex(snapshot));
}

function loadTasks(taskwarrior: TaskwarriorLib): StoredTask[] {
  try {
    return taskwarrior.load("") as StoredTask[];
  } catch (error) {
    throw toCliError(error);
  }
}

function loadFlatConfig(taskwarrior: TaskwarriorLib): Record<string, string> {
  try {
    const rawConfig = taskwarrior.executeCommand("_show");
    const config: Record<string, string> = {};
    for (const line of rawConfig.split(/\r?\n/)) {
      if (!line) {
        continue;
      }
      const separator = line.indexOf("=");
      if (separator < 0) {
        continue;
      }
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);
      config[key] = value;
    }
    return config;
  } catch (error) {
    throw toCliError(error);
  }
}

function loadUdaDefinitions(taskwarrior: TaskwarriorLib): UdaDefinition[] {
  const definitions = new Map<string, UdaDefinition>();
  const flatConfig = loadFlatConfig(taskwarrior);

  for (const [key, value] of Object.entries(flatConfig)) {
    const match = /^uda\.(.+)\.(type|label|values|default)$/.exec(key);
    if (!match) {
      continue;
    }

    const name = match[1];
    const property = match[2];
    if (!name || !property) {
      continue;
    }

    const current = definitions.get(name) ?? { name };

    if (property === "type") {
      definitions.set(name, { ...current, type: value });
      continue;
    }

    if (property === "label") {
      definitions.set(name, { ...current, label: value });
      continue;
    }

    if (property === "default") {
      definitions.set(name, { ...current, defaultValue: value });
      continue;
    }

    const rawValues = value.split(",");
    definitions.set(name, {
      ...current,
      values: rawValues.filter((item) => item.length > 0),
      allowBlank: rawValues.some((item) => item.length === 0),
    });
  }

  return [...definitions.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function makeUdaDefinitionMap(definitions: readonly UdaDefinition[]): ReadonlyMap<string, UdaDefinition> {
  return new Map(definitions.map((definition) => [definition.name, definition]));
}

function validateUdaValue(definition: UdaDefinition, value: string): void {
  if (definition.type === "numeric") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new CliError("INVALID_UDA_VALUE", `UDA '${definition.name}' expects a numeric value`, EXIT_CODE.validation, {
        uda: definition.name,
        value,
      });
    }
  }

  if (definition.values && definition.values.length > 0) {
    const isAllowed = definition.values.includes(value) || (definition.allowBlank && value === "");
    if (!isAllowed) {
      throw new CliError("INVALID_UDA_VALUE", `UDA '${definition.name}' value is not allowed`, EXIT_CODE.validation, {
        uda: definition.name,
        value,
        allowedValues: definition.values,
        allowBlank: definition.allowBlank ?? false,
      });
    }
  }
}

function parseUdaAssignments(rawAssignments: readonly string[] | undefined, definitions: readonly UdaDefinition[]): Record<string, string> {
  const assignments: Record<string, string> = {};
  if (!rawAssignments || rawAssignments.length === 0) {
    return assignments;
  }

  const definitionMap = makeUdaDefinitionMap(definitions);

  for (const rawAssignment of rawAssignments) {
    const separator = rawAssignment.indexOf("=");
    if (separator <= 0) {
      throw new CliError("INVALID_UDA_ASSIGNMENT", "UDA assignments must use key=value", EXIT_CODE.validation, {
        value: rawAssignment,
      });
    }

    const key = rawAssignment.slice(0, separator).trim();
    const value = rawAssignment.slice(separator + 1);
    if (!key) {
      throw new CliError("INVALID_UDA_ASSIGNMENT", "UDA assignment key cannot be empty", EXIT_CODE.validation, {
        value: rawAssignment,
      });
    }

    const definition = definitionMap.get(key);
    if (!definition) {
      throw new CliError("UNKNOWN_UDA", `UDA '${key}' is not configured in Taskwarrior`, EXIT_CODE.validation, {
        uda: key,
      });
    }

    validateUdaValue(definition, value);
    assignments[key] = value;
  }

  return assignments;
}

function validateClearUdas(rawKeys: readonly string[] | undefined, definitions: readonly UdaDefinition[]): string[] {
  const keys = rawKeys?.map((key) => key.trim()).filter((key) => key.length > 0) ?? [];
  if (keys.length === 0) {
    return [];
  }

  const definitionMap = makeUdaDefinitionMap(definitions);
  for (const key of keys) {
    if (!definitionMap.has(key)) {
      throw new CliError("UNKNOWN_UDA", `UDA '${key}' is not configured in Taskwarrior`, EXIT_CODE.validation, {
        uda: key,
      });
    }
  }

  return [...new Set(keys)];
}

function stringArray(values: readonly string[] | undefined): string[] {
  return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
}

function positiveIntegerParser(input: string): number {
  const parsed = numberParser(input);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("INVALID_INTEGER", "Expected a positive integer", EXIT_CODE.validation, { input });
  }
  return parsed;
}

function nonNegativeIntegerParser(input: string): number {
  const parsed = numberParser(input);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError("INVALID_INTEGER", "Expected a non-negative integer", EXIT_CODE.validation, { input });
  }
  return parsed;
}

function normalizeUuid(uuid: string): string {
  const normalized = uuid.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new CliError("INVALID_UUID", `Invalid UUID '${uuid}'`, EXIT_CODE.validation, { uuid });
  }
  return normalized;
}

function normalizeUuidList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map(normalizeUuid))];
}

function requireTaskByUuid(tasks: readonly StoredTask[], uuid: string): StoredTask {
  const task = tasks.find((candidate) => candidate.uuid === uuid);
  if (!task) {
    throw new CliError("TASK_NOT_FOUND", `Task '${uuid}' was not found`, EXIT_CODE.notFound, { uuid });
  }
  return task;
}

function comparePriority(left: TaskPriority | undefined, right: TaskPriority | undefined): number {
  const rank: Record<string, number> = { H: 3, M: 2, L: 1 };
  return (rank[left ?? ""] ?? 0) - (rank[right ?? ""] ?? 0);
}

function sortTasks(tasks: readonly StoredTask[], sortField: (typeof SORT_VALUES)[number] | undefined, descending: boolean): StoredTask[] {
  const field = sortField ?? "due";
  const sorted = [...tasks].sort((left, right) => {
    let comparison = 0;
    if (field === "priority") {
      comparison = comparePriority(left.priority, right.priority);
    } else if (field === "description") {
      comparison = (left.description ?? "").localeCompare(right.description ?? "");
    } else if (field === "project") {
      comparison = (left.project ?? "").localeCompare(right.project ?? "");
    } else if (field === "modified") {
      comparison = (parseTaskDate(left.modified) ?? Number.MIN_SAFE_INTEGER) - (parseTaskDate(right.modified) ?? Number.MIN_SAFE_INTEGER);
    } else if (field === "entry") {
      comparison = (parseTaskDate(left.entry) ?? Number.MIN_SAFE_INTEGER) - (parseTaskDate(right.entry) ?? Number.MIN_SAFE_INTEGER);
    } else if (field === "scheduled") {
      comparison = (parseTaskDate(left.scheduled) ?? Number.MAX_SAFE_INTEGER) - (parseTaskDate(right.scheduled) ?? Number.MAX_SAFE_INTEGER);
    } else {
      comparison = (parseTaskDate(left.due) ?? Number.MAX_SAFE_INTEGER) - (parseTaskDate(right.due) ?? Number.MAX_SAFE_INTEGER);
    }

    if (comparison === 0) {
      comparison = (left.description ?? "").localeCompare(right.description ?? "");
    }

    return descending ? -comparison : comparison;
  });

  return sorted;
}

function defaultListStatuses(statuses: readonly TaskStatus[] | undefined): readonly TaskStatus[] {
  return statuses && statuses.length > 0 ? statuses : OPEN_STATUS_VALUES;
}

function applyListFilters(
  tasks: readonly StoredTask[],
  taskwarrior: TaskwarriorLib,
  flags: {
    readonly uuid?: readonly string[];
    readonly status?: readonly TaskStatus[];
    readonly project?: string;
    readonly projectPrefix?: string;
    readonly priority?: (typeof PRIORITY_FILTER_VALUES)[number];
    readonly tag?: readonly string[];
    readonly anyTag?: readonly string[];
    readonly text?: string;
    readonly dueBefore?: string;
    readonly dueAfter?: string;
    readonly scheduledBefore?: string;
    readonly scheduledAfter?: string;
    readonly waitBefore?: string;
    readonly waitAfter?: string;
    readonly blocked: boolean;
    readonly blocking: boolean;
    readonly active: boolean;
    readonly ready: boolean;
    readonly overdue: boolean;
  },
): StoredTask[] {
  const taskIndex = buildTaskIndex(tasks);
  const nowEpoch = getNowEpoch();
  const dueBeforeEpoch = flags.dueBefore ? parseTaskDate(resolveCalc(taskwarrior, flags.dueBefore, "dueBefore")) : undefined;
  const dueAfterEpoch = flags.dueAfter ? parseTaskDate(resolveCalc(taskwarrior, flags.dueAfter, "dueAfter")) : undefined;
  const scheduledBeforeEpoch = flags.scheduledBefore
    ? parseTaskDate(resolveCalc(taskwarrior, flags.scheduledBefore, "scheduledBefore"))
    : undefined;
  const scheduledAfterEpoch = flags.scheduledAfter
    ? parseTaskDate(resolveCalc(taskwarrior, flags.scheduledAfter, "scheduledAfter"))
    : undefined;
  const waitBeforeEpoch = flags.waitBefore ? parseTaskDate(resolveCalc(taskwarrior, flags.waitBefore, "waitBefore")) : undefined;
  const waitAfterEpoch = flags.waitAfter ? parseTaskDate(resolveCalc(taskwarrior, flags.waitAfter, "waitAfter")) : undefined;
  const normalizedText = flags.text?.trim().toLowerCase();
  const requiredTags = new Set(stringArray(flags.tag));
  const anyTags = new Set(stringArray(flags.anyTag));
  const uuids = new Set(normalizeUuidList(flags.uuid));
  const statuses = new Set(defaultListStatuses(flags.status));

  return tasks.filter((task) => {
    if (uuids.size > 0 && (!task.uuid || !uuids.has(task.uuid))) {
      return false;
    }

    if (!statuses.has(task.status ?? "pending")) {
      return false;
    }

    if (flags.project && task.project !== flags.project) {
      return false;
    }

    if (flags.projectPrefix && !(task.project ?? "").startsWith(flags.projectPrefix)) {
      return false;
    }

    if (flags.priority === "none") {
      if (task.priority !== undefined) {
        return false;
      }
    } else if (flags.priority && task.priority !== flags.priority) {
      return false;
    }

    const tags = new Set(getTags(task));
    for (const tag of requiredTags) {
      if (!tags.has(tag)) {
        return false;
      }
    }

    if (anyTags.size > 0 && ![...anyTags].some((tag) => tags.has(tag))) {
      return false;
    }

    if (normalizedText) {
      const haystack = [task.description ?? "", ...getAnnotations(task).map((annotation) => annotation.description)]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(normalizedText)) {
        return false;
      }
    }

    const dueEpoch = parseTaskDate(task.due);
    if (dueBeforeEpoch !== undefined && (dueEpoch === undefined || dueEpoch >= dueBeforeEpoch)) {
      return false;
    }

    if (dueAfterEpoch !== undefined && (dueEpoch === undefined || dueEpoch <= dueAfterEpoch)) {
      return false;
    }

    const scheduledEpoch = parseTaskDate(task.scheduled);
    if (scheduledBeforeEpoch !== undefined && (scheduledEpoch === undefined || scheduledEpoch >= scheduledBeforeEpoch)) {
      return false;
    }

    if (scheduledAfterEpoch !== undefined && (scheduledEpoch === undefined || scheduledEpoch <= scheduledAfterEpoch)) {
      return false;
    }

    const waitEpoch = parseTaskDate(task.wait);
    if (waitBeforeEpoch !== undefined && (waitEpoch === undefined || waitEpoch >= waitBeforeEpoch)) {
      return false;
    }

    if (waitAfterEpoch !== undefined && (waitEpoch === undefined || waitEpoch <= waitAfterEpoch)) {
      return false;
    }

    if (flags.blocked && !isBlocked(task, taskIndex)) {
      return false;
    }

    if (flags.blocking && !isBlocking(task, tasks)) {
      return false;
    }

    if (flags.active && !isActive(task)) {
      return false;
    }

    if (flags.ready && !isReady(task, taskIndex, nowEpoch)) {
      return false;
    }

    if (flags.overdue && !isOverdue(task, nowEpoch)) {
      return false;
    }

    return true;
  });
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function ensureNoConflict(active: boolean, conflicting: boolean, message: string, details?: unknown): void {
  if (active && conflicting) {
    throw new CliError("CONFLICTING_FLAGS", message, EXIT_CODE.validation, details);
  }
}

function createAnnotation(description: string): TaskAnnotation {
  return {
    entry: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    description,
  };
}

function buildSchemaPayload(udas: readonly UdaDefinition[]) {
  return {
    ok: true,
    cli: {
      name: COMMAND_NAME,
      output: {
        success: "single JSON object on stdout",
        error: "single JSON object on stderr",
      },
      identifiers: {
        mutationKey: "uuid",
      },
      statuses: STATUS_VALUES,
      defaultListStatuses: OPEN_STATUS_VALUES,
      priorities: PRIORITY_VALUES,
      mutableScalarFields: MUTABLE_SCALAR_FIELDS,
      commands: {
        schema: {},
        doctor: {},
        list: {
          filters: [
            "uuid",
            "status",
            "project",
            "projectPrefix",
            "priority",
            "tag",
            "anyTag",
            "text",
            "dueBefore",
            "dueAfter",
            "scheduledBefore",
            "scheduledAfter",
            "waitBefore",
            "waitAfter",
            "blocked",
            "blocking",
            "active",
            "ready",
            "overdue",
            "limit",
            "sort",
            "desc",
          ],
        },
        get: {
          required: ["uuid"],
        },
        create: {
          required: ["description"],
          optional: ["project", "priority", "due", "wait", "scheduled", "until", "recur", "tag", "dependsOn", "annotation", "uda"],
        },
        update: {
          required: ["uuid"],
          supports: [
            "scalar field set/clear",
            "tag add/remove/set/clear",
            "dependency add/remove/set/clear",
            "annotation add/remove",
            "uda set/clear",
          ],
        },
        complete: { required: ["uuid"] },
        reopen: { required: ["uuid"] },
        start: { required: ["uuid"] },
        stop: { required: ["uuid"] },
        delete: { required: ["uuid"] },
        projects: {},
        tags: {},
        stats: {},
      },
      configuredUdas: udas,
    },
  };
}

const schemaCommand = buildCommand({
  func: () => {
    let udas: UdaDefinition[] = [];
    try {
      const { taskwarrior } = requireTaskwarrior();
      udas = loadUdaDefinitions(taskwarrior);
    } catch {
      udas = [];
    }

    writeJson(buildSchemaPayload(udas));
  },
  parameters: {},
  docs: {
    brief: "Emit machine-readable CLI schema",
  },
});

const doctorCommand = buildCommand({
  func: () => {
    try {
      const version = ensureTaskBinary();
      const taskwarrior = createTaskwarrior();
      const udas = loadUdaDefinitions(taskwarrior);
      writeJson({
        ok: true,
        healthy: true,
        doctor: {
          taskBinaryAvailable: true,
          taskVersion: version,
          taskwarriorLibAvailable: true,
          configuredUdas: udas,
          warnings: [],
        },
      });
    } catch (error) {
      const cliError = toCliError(error, "DOCTOR_FAILED", EXIT_CODE.environment);
      writeJson({
        ok: true,
        healthy: false,
        doctor: {
          taskBinaryAvailable: false,
          taskVersion: null,
          taskwarriorLibAvailable: true,
          configuredUdas: [],
          warnings: [errorPayload(cliError).error],
        },
      });
    }
  },
  parameters: {},
  docs: {
    brief: "Check Taskwarrior availability and discovered capabilities",
  },
});

type ListFlags = {
  readonly uuid?: string[];
  readonly status?: TaskStatus[];
  readonly project?: string;
  readonly projectPrefix?: string;
  readonly priority?: (typeof PRIORITY_FILTER_VALUES)[number];
  readonly tag?: string[];
  readonly anyTag?: string[];
  readonly text?: string;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly scheduledBefore?: string;
  readonly scheduledAfter?: string;
  readonly waitBefore?: string;
  readonly waitAfter?: string;
  readonly blocked: boolean;
  readonly blocking: boolean;
  readonly active: boolean;
  readonly ready: boolean;
  readonly overdue: boolean;
  readonly limit?: number;
  readonly sort?: (typeof SORT_VALUES)[number];
  readonly desc: boolean;
};

const listCommand = buildCommand({
  func: (flags: ListFlags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const filtered = applyListFilters(tasks, taskwarrior, flags);
    const sorted = sortTasks(filtered, flags.sort, flags.desc);
    const limited = flags.limit ? sorted.slice(0, flags.limit) : sorted;

    writeJson({
      ok: true,
      count: limited.length,
      tasks: serializeTasks(limited),
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Filter by UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true,
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      projectPrefix: {
        brief: "Filter by project prefix",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      priority: {
        brief: "Filter by priority",
        kind: "enum",
        values: PRIORITY_FILTER_VALUES,
        optional: true,
      },
      tag: {
        brief: "Require all listed tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      anyTag: {
        brief: "Require any listed tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      text: {
        brief: "Search description and annotations",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      dueBefore: {
        brief: "Filter due before expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      dueAfter: {
        brief: "Filter due after expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      scheduledBefore: {
        brief: "Filter scheduled before expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      scheduledAfter: {
        brief: "Filter scheduled after expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      waitBefore: {
        brief: "Filter wait before expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      waitAfter: {
        brief: "Filter wait after expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      blocked: {
        brief: "Only blocked tasks",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      blocking: {
        brief: "Only blocking tasks",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      active: {
        brief: "Only active tasks",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      ready: {
        brief: "Only ready tasks",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      overdue: {
        brief: "Only overdue tasks",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true,
      },
      sort: {
        brief: "Sort field",
        kind: "enum",
        values: SORT_VALUES,
        optional: true,
      },
      desc: {
        brief: "Reverse sort order",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
    },
  },
  docs: {
    brief: "List tasks with structured filters",
  },
});

type GetFlags = {
  readonly uuid: string[];
};

const getCommand = buildCommand({
  func: (flags: GetFlags) => {
    const requested = normalizeUuidList(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const taskIndex = buildTaskIndex(tasks);
    const found = requested.map((uuid) => taskIndex.get(uuid)).filter((task): task is StoredTask => Boolean(task));
    const missing = requested.filter((uuid) => !taskIndex.has(uuid));

    writeJson({
      ok: true,
      count: found.length,
      tasks: serializeTasks(found),
      missing,
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "UUID to fetch",
        kind: "parsed",
        parse: String,
        variadic: true,
      },
    },
  },
  docs: {
    brief: "Fetch tasks by UUID",
  },
});

type CreateFlags = {
  readonly description: string;
  readonly project?: string;
  readonly priority?: TaskPriority;
  readonly due?: string;
  readonly wait?: string;
  readonly scheduled?: string;
  readonly until?: string;
  readonly recur?: string;
  readonly tag?: string[];
  readonly dependsOn?: string[];
  readonly annotation?: string[];
  readonly uda?: string[];
};

const createCommand = buildCommand({
  func: (flags: CreateFlags) => {
    if (flags.recur && !flags.due) {
      throw new CliError("INVALID_ARGUMENT", "Recurring tasks require --due", EXIT_CODE.validation);
    }

    const { taskwarrior } = requireTaskwarrior();
    const udas = loadUdaDefinitions(taskwarrior);
    const uuid = randomUUID();
    const task: StoredTask = {
      uuid,
      description: flags.description,
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.priority ? { priority: flags.priority } : {}),
      ...(flags.due ? { due: flags.due } : {}),
      ...(flags.wait ? { wait: flags.wait } : {}),
      ...(flags.scheduled ? { scheduled: flags.scheduled } : {}),
      ...(flags.until ? { until: flags.until } : {}),
      ...(flags.recur ? { recur: flags.recur } : {}),
    };

    const tags = dedupeStrings(stringArray(flags.tag));
    if (tags.length > 0) {
      task.tags = tags;
    }

    const dependencies = normalizeUuidList(flags.dependsOn);
    if (dependencies.length > 0) {
      task.depends = dependencies;
    }

    const annotations = stringArray(flags.annotation).map(createAnnotation);
    if (annotations.length > 0) {
      task.annotations = annotations;
    }

    Object.assign(task, parseUdaAssignments(flags.uda, udas));
    taskwarrior.update([task]);

    const tasks = loadTasks(taskwarrior);
    const created = requireTaskByUuid(tasks, normalizeUuid(uuid));
    writeJson({
      ok: true,
      task: serializeTask(created, tasks),
    });
  },
  parameters: {
    flags: {
      description: {
        brief: "Task description",
        kind: "parsed",
        parse: String,
      },
      project: {
        brief: "Project",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      priority: {
        brief: "Priority",
        kind: "enum",
        values: PRIORITY_VALUES,
        optional: true,
      },
      due: {
        brief: "Due date expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      wait: {
        brief: "Wait date expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      scheduled: {
        brief: "Scheduled date expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      until: {
        brief: "Until date expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      recur: {
        brief: "Recurrence period",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      tag: {
        brief: "Tag to add",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      dependsOn: {
        brief: "Dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      annotation: {
        brief: "Annotation text",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      uda: {
        brief: "UDA assignment key=value",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
    },
  },
  docs: {
    brief: "Create one task",
  },
});

type UpdateFlags = {
  readonly uuid: string;
  readonly description?: string;
  readonly project?: string;
  readonly clearProject: boolean;
  readonly priority?: TaskPriority;
  readonly clearPriority: boolean;
  readonly due?: string;
  readonly clearDue: boolean;
  readonly wait?: string;
  readonly clearWait: boolean;
  readonly scheduled?: string;
  readonly clearScheduled: boolean;
  readonly until?: string;
  readonly clearUntil: boolean;
  readonly recur?: string;
  readonly clearRecur: boolean;
  readonly addTag?: string[];
  readonly removeTag?: string[];
  readonly setTag?: string[];
  readonly clearTags: boolean;
  readonly addDependency?: string[];
  readonly removeDependency?: string[];
  readonly setDependency?: string[];
  readonly clearDependencies: boolean;
  readonly addAnnotation?: string[];
  readonly removeAnnotationEntry?: string[];
  readonly removeAnnotationIndex?: number[];
  readonly uda?: string[];
  readonly clearUda?: string[];
};

const updateCommand = buildCommand({
  func: (flags: UpdateFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    const udas = loadUdaDefinitions(taskwarrior);

    ensureNoConflict(Boolean(flags.project), flags.clearProject, "Cannot combine --project with --clear-project");
    ensureNoConflict(Boolean(flags.priority), flags.clearPriority, "Cannot combine --priority with --clear-priority");
    ensureNoConflict(Boolean(flags.due), flags.clearDue, "Cannot combine --due with --clear-due");
    ensureNoConflict(Boolean(flags.wait), flags.clearWait, "Cannot combine --wait with --clear-wait");
    ensureNoConflict(Boolean(flags.scheduled), flags.clearScheduled, "Cannot combine --scheduled with --clear-scheduled");
    ensureNoConflict(Boolean(flags.until), flags.clearUntil, "Cannot combine --until with --clear-until");
    ensureNoConflict(Boolean(flags.recur), flags.clearRecur, "Cannot combine --recur with --clear-recur");
    ensureNoConflict(Boolean(flags.setTag?.length), flags.clearTags, "Cannot combine --set-tag with --clear-tags");
    ensureNoConflict(
      Boolean(flags.setDependency?.length),
      flags.clearDependencies,
      "Cannot combine --set-dependency with --clear-dependencies",
    );

    const next: StoredTask = { ...current };
    const updatedFields: string[] = [];
    const clearedFields: string[] = [];

    if (flags.description !== undefined) {
      next.description = flags.description;
      updatedFields.push("description");
    }

    if (flags.project !== undefined) {
      next.project = flags.project;
      updatedFields.push("project");
    } else if (flags.clearProject) {
      delete next.project;
      clearedFields.push("project");
    }

    if (flags.priority !== undefined) {
      next.priority = flags.priority;
      updatedFields.push("priority");
    } else if (flags.clearPriority) {
      delete next.priority;
      clearedFields.push("priority");
    }

    if (flags.due !== undefined) {
      next.due = flags.due;
      updatedFields.push("due");
    } else if (flags.clearDue) {
      delete next.due;
      clearedFields.push("due");
    }

    if (flags.wait !== undefined) {
      next.wait = flags.wait;
      updatedFields.push("wait");
    } else if (flags.clearWait) {
      delete next.wait;
      clearedFields.push("wait");
    }

    if (flags.scheduled !== undefined) {
      next.scheduled = flags.scheduled;
      updatedFields.push("scheduled");
    } else if (flags.clearScheduled) {
      delete next.scheduled;
      clearedFields.push("scheduled");
    }

    if (flags.until !== undefined) {
      next.until = flags.until;
      updatedFields.push("until");
    } else if (flags.clearUntil) {
      delete next.until;
      clearedFields.push("until");
    }

    if (flags.recur !== undefined) {
      next.recur = flags.recur;
      updatedFields.push("recur");
    } else if (flags.clearRecur) {
      delete next.recur;
      clearedFields.push("recur");
    }

    const tagChanges = {
      added: [] as string[],
      removed: [] as string[],
    };
    const currentTags = getTags(current);
    let nextTags = [...currentTags];
    if (flags.clearTags) {
      nextTags = [];
      tagChanges.removed = currentTags;
    } else if (flags.setTag && flags.setTag.length > 0) {
      const replacement = dedupeStrings(stringArray(flags.setTag));
      tagChanges.added = replacement.filter((tag) => !currentTags.includes(tag));
      tagChanges.removed = currentTags.filter((tag) => !replacement.includes(tag));
      nextTags = replacement;
    } else {
      const additions = dedupeStrings(stringArray(flags.addTag));
      const removals = dedupeStrings(stringArray(flags.removeTag));
      tagChanges.added = additions.filter((tag) => !currentTags.includes(tag));
      tagChanges.removed = removals.filter((tag) => currentTags.includes(tag));
      nextTags = currentTags.filter((tag) => !removals.includes(tag));
      nextTags.push(...tagChanges.added);
      nextTags = dedupeStrings(nextTags);
    }
    if (nextTags.length > 0) {
      next.tags = nextTags;
    } else {
      delete next.tags;
    }

    const dependencyChanges = {
      added: [] as string[],
      removed: [] as string[],
    };
    const currentDependencies = getDepends(current);
    let nextDependencies = [...currentDependencies];
    if (flags.clearDependencies) {
      nextDependencies = [];
      dependencyChanges.removed = currentDependencies;
    } else if (flags.setDependency && flags.setDependency.length > 0) {
      const replacement = normalizeUuidList(flags.setDependency);
      dependencyChanges.added = replacement.filter((dependency) => !currentDependencies.includes(dependency));
      dependencyChanges.removed = currentDependencies.filter((dependency) => !replacement.includes(dependency));
      nextDependencies = replacement;
    } else {
      const additions = normalizeUuidList(flags.addDependency);
      const removals = normalizeUuidList(flags.removeDependency);
      dependencyChanges.added = additions.filter((dependency) => !currentDependencies.includes(dependency));
      dependencyChanges.removed = removals.filter((dependency) => currentDependencies.includes(dependency));
      nextDependencies = currentDependencies.filter((dependency) => !removals.includes(dependency));
      nextDependencies.push(...dependencyChanges.added);
      nextDependencies = dedupeStrings(nextDependencies);
    }
    if (nextDependencies.includes(uuid)) {
      throw new CliError("INVALID_DEPENDENCY", "Task cannot depend on itself", EXIT_CODE.validation, { uuid });
    }
    if (nextDependencies.length > 0) {
      next.depends = nextDependencies;
    } else {
      delete next.depends;
    }

    const annotations = [...getAnnotations(current)];
    const removeEntries = new Set(stringArray(flags.removeAnnotationEntry));
    const removeIndexes = new Set(flags.removeAnnotationIndex ?? []);
    const nextAnnotations = annotations.filter((annotation, index) => {
      if (removeEntries.has(annotation.entry)) {
        return false;
      }
      if (removeIndexes.has(index)) {
        return false;
      }
      return true;
    });
    const addedAnnotations = stringArray(flags.addAnnotation).map(createAnnotation);
    nextAnnotations.push(...addedAnnotations);
    if (nextAnnotations.length > 0) {
      next.annotations = nextAnnotations;
    } else {
      delete next.annotations;
    }

    const udaAssignments = parseUdaAssignments(flags.uda, udas);
    const clearUdas = validateClearUdas(flags.clearUda, udas);
    for (const [key, value] of Object.entries(udaAssignments)) {
      next[key] = value;
    }
    for (const key of clearUdas) {
      delete next[key];
    }

    const hasChanges =
      updatedFields.length > 0 ||
      clearedFields.length > 0 ||
      tagChanges.added.length > 0 ||
      tagChanges.removed.length > 0 ||
      dependencyChanges.added.length > 0 ||
      dependencyChanges.removed.length > 0 ||
      addedAnnotations.length > 0 ||
      removeEntries.size > 0 ||
      removeIndexes.size > 0 ||
      Object.keys(udaAssignments).length > 0 ||
      clearUdas.length > 0;

    if (!hasChanges) {
      throw new CliError("NO_CHANGES_REQUESTED", "No update changes were requested", EXIT_CODE.validation);
    }

    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({
      ok: true,
      task: serializeTask(refreshed, refreshedTasks),
      changes: {
        updatedFields,
        clearedFields,
        tags: {
          added: tagChanges.added,
          removed: tagChanges.removed,
          after: getTags(refreshed),
        },
        dependencies: {
          added: dependencyChanges.added,
          removed: dependencyChanges.removed,
          after: getDepends(refreshed),
        },
        annotations: {
          added: addedAnnotations.map((annotation) => annotation.description),
          removedEntries: [...removeEntries],
          removedIndexes: [...removeIndexes],
          afterCount: getAnnotations(refreshed).length,
        },
        udas: {
          set: Object.keys(udaAssignments),
          cleared: clearUdas,
        },
      },
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
      description: {
        brief: "New description",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      project: {
        brief: "Set project",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearProject: {
        brief: "Clear project",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      priority: {
        brief: "Set priority",
        kind: "enum",
        values: PRIORITY_VALUES,
        optional: true,
      },
      clearPriority: {
        brief: "Clear priority",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      due: {
        brief: "Set due date",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearDue: {
        brief: "Clear due date",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      wait: {
        brief: "Set wait date",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearWait: {
        brief: "Clear wait date",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      scheduled: {
        brief: "Set scheduled date",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearScheduled: {
        brief: "Clear scheduled date",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      until: {
        brief: "Set until date",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearUntil: {
        brief: "Clear until date",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      recur: {
        brief: "Set recurrence period",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      clearRecur: {
        brief: "Clear recurrence period",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      addTag: {
        brief: "Add tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      removeTag: {
        brief: "Remove tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      setTag: {
        brief: "Replace all tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      clearTags: {
        brief: "Remove all tags",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      addDependency: {
        brief: "Add dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      removeDependency: {
        brief: "Remove dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      setDependency: {
        brief: "Replace all dependency UUIDs",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      clearDependencies: {
        brief: "Remove all dependencies",
        kind: "boolean",
        default: false,
        withNegated: false,
      },
      addAnnotation: {
        brief: "Add annotation",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      removeAnnotationEntry: {
        brief: "Remove annotation by entry timestamp",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      removeAnnotationIndex: {
        brief: "Remove annotation by zero-based index",
        kind: "parsed",
        parse: nonNegativeIntegerParser,
        optional: true,
        variadic: true,
      },
      uda: {
        brief: "Set UDA with key=value",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
      clearUda: {
        brief: "Clear configured UDA",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
    },
  },
  docs: {
    brief: "Update one task by UUID",
  },
});

type SingleUuidFlags = {
  readonly uuid: string;
};

type CompleteFlags = SingleUuidFlags & {
  readonly at?: string;
};

const completeCommand = buildCommand({
  func: (flags: CompleteFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Cannot complete a recurring template task", EXIT_CODE.validation, {
        uuid,
      });
    }

    const next: StoredTask = { ...current, status: "completed" };
    if (flags.at) {
      next.end = resolveCalc(taskwarrior, flags.at, "completion time");
    } else {
      delete next.end;
    }

    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
      at: {
        brief: "Completion time expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
    },
  },
  docs: {
    brief: "Mark a task completed",
  },
});

const reopenCommand = buildCommand({
  func: (flags: SingleUuidFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status !== "completed" && current.status !== "deleted") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Only completed or deleted tasks can be reopened", EXIT_CODE.validation, {
        uuid,
        status: current.status,
      });
    }

    const next: StoredTask = { ...current, status: "pending" };
    delete next.end;
    taskwarrior.update([next]);

    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
    },
  },
  docs: {
    brief: "Reopen a completed or deleted task",
  },
});

type StartFlags = SingleUuidFlags & {
  readonly at?: string;
};

const startCommand = buildCommand({
  func: (flags: StartFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (isClosed(current) || current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Only pending or waiting tasks can be started", EXIT_CODE.validation, {
        uuid,
        status: current.status,
      });
    }

    const next: StoredTask = { ...current, start: flags.at ?? "now" };
    taskwarrior.update([next]);

    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
      at: {
        brief: "Start time expression",
        kind: "parsed",
        parse: String,
        optional: true,
      },
    },
  },
  docs: {
    brief: "Mark a task started",
  },
});

const stopCommand = buildCommand({
  func: (flags: SingleUuidFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Recurring template tasks cannot be stopped", EXIT_CODE.validation, {
        uuid,
      });
    }

    const next: StoredTask = { ...current };
    delete next.start;
    taskwarrior.update([next]);

    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
    },
  },
  docs: {
    brief: "Clear task start time",
  },
});

const deleteCommand = buildCommand({
  func: (flags: SingleUuidFlags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "deleted") {
      writeJson({
        ok: true,
        deleted: {
          uuid,
          alreadyDeleted: true,
        },
      });
      return;
    }

    taskwarrior.del([{ uuid }]);
    writeJson({
      ok: true,
      deleted: {
        uuid,
        description: current.description ?? null,
        statusBefore: current.status ?? "pending",
      },
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String,
      },
    },
  },
  docs: {
    brief: "Soft-delete one task",
  },
});

type AggregateFilterFlags = {
  readonly status?: TaskStatus[];
  readonly project?: string;
  readonly tag?: string[];
};

type ProjectsFlags = {
  readonly status?: TaskStatus[];
  readonly limit?: number;
};

type TagsFlags = {
  readonly status?: TaskStatus[];
  readonly project?: string;
  readonly limit?: number;
};

type StatsFlags = {
  readonly status?: TaskStatus[];
  readonly project?: string;
  readonly tag?: string[];
};

function applyAggregateBaseFilters(tasks: readonly StoredTask[], flags: AggregateFilterFlags): StoredTask[] {
  const statuses = new Set(defaultListStatuses(flags.status));
  const requiredTags = new Set(stringArray(flags.tag));
  return tasks.filter((task) => {
    if (!statuses.has(task.status ?? "pending")) {
      return false;
    }

    if (flags.project && task.project !== flags.project) {
      return false;
    }

    const tags = new Set(getTags(task));
    for (const tag of requiredTags) {
      if (!tags.has(tag)) {
        return false;
      }
    }

    return true;
  });
}

const projectsCommand = buildCommand({
  func: (flags: ProjectsFlags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = applyAggregateBaseFilters(loadTasks(taskwarrior), flags);
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.project) {
        continue;
      }
      counts.set(task.project, (counts.get(task.project) ?? 0) + 1);
    }

    const projects = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    const limited = flags.limit ? projects.slice(0, flags.limit) : projects;

    writeJson({ ok: true, count: limited.length, projects: limited });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true,
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true,
      },
    },
  },
  docs: {
    brief: "Aggregate projects and counts",
  },
});

const tagsCommand = buildCommand({
  func: (flags: TagsFlags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = applyAggregateBaseFilters(loadTasks(taskwarrior), flags);
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const tag of getTags(task)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const tags = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    const limited = flags.limit ? tags.slice(0, flags.limit) : tags;

    writeJson({ ok: true, count: limited.length, tags: limited });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true,
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true,
      },
    },
  },
  docs: {
    brief: "Aggregate tags and counts",
  },
});

const statsCommand = buildCommand({
  func: (flags: StatsFlags) => {
    const { taskwarrior } = requireTaskwarrior();
    const allTasks = loadTasks(taskwarrior);
    const tasks = applyAggregateBaseFilters(allTasks, flags);
    const taskIndex = buildTaskIndex(allTasks);
    const nowEpoch = getNowEpoch();

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byProject: Record<string, number> = {};

    for (const task of tasks) {
      const status = task.status ?? "pending";
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const priority = task.priority ?? "none";
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;

      const project = task.project ?? "none";
      byProject[project] = (byProject[project] ?? 0) + 1;
    }

    writeJson({
      ok: true,
      stats: {
        total: tasks.length,
        byStatus,
        byPriority,
        byProject,
        active: tasks.filter((task) => isActive(task)).length,
        blocked: tasks.filter((task) => isBlocked(task, taskIndex)).length,
        blocking: tasks.filter((task) => isBlocking(task, allTasks)).length,
        ready: tasks.filter((task) => isReady(task, taskIndex, nowEpoch)).length,
        overdue: tasks.filter((task) => isOverdue(task, nowEpoch)).length,
        waiting: tasks.filter((task) => isWaiting(task, nowEpoch)).length,
      },
    });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true,
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true,
      },
      tag: {
        brief: "Require all listed tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true,
      },
    },
  },
  docs: {
    brief: "Aggregate task counts and computed states",
  },
});

const root = buildRouteMap({
  routes: {
    schema: schemaCommand,
    doctor: doctorCommand,
    list: listCommand,
    get: getCommand,
    create: createCommand,
    update: updateCommand,
    complete: completeCommand,
    reopen: reopenCommand,
    start: startCommand,
    stop: stopCommand,
    delete: deleteCommand,
    projects: projectsCommand,
    tags: tagsCommand,
    stats: statsCommand,
  },
  docs: {
    brief: "Agent-only Taskwarrior CLI",
  },
});

const app = buildApplication(root, {
  name: COMMAND_NAME,
  scanner: {
    caseStyle: "allow-kebab-for-camel",
    allowArgumentEscapeSequence: false,
  },
  documentation: {
    caseStyle: "convert-camel-to-kebab",
    disableAnsiColor: true,
    onlyRequiredInUsageLine: false,
    alwaysShowHelpAllFlag: false,
    useAliasInUsageLine: false,
  },
  localization: {
    defaultLocale: "en",
    loadText: () => appText,
  },
  determineExitCode,
});

const rawExitCode = await runApplication(app, process.argv.slice(2), { process });
process.exitCode = normalizeExitCode(rawExitCode);
