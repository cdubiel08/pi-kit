import { countDisplayLines, countEntries, countHits, hasTruncation, lineCountFromContent } from "./parsers.ts";

export type ToolState = "pending" | "success" | "warning" | "error";

export type ToolKind =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "grep"
  | "find"
  | "ls"
  | "web_search"
  | "fetch_content"
  | "other";

export interface ToolSummary {
  toolCallId: string;
  toolName: string;
  kind: ToolKind;
  label: string;
  state: ToolState;
  primary: string;
  metric?: string;
  shortLine: string;
  groupNoun: string;
  startedAt?: number;
  endedAt?: number;
  order: number;
  errorExcerpt?: string;
}

export interface SummaryInput {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: {
    content?: Array<{ type?: unknown; text?: unknown }>;
    details?: unknown;
  };
  isError?: boolean;
  isPartial?: boolean;
  startedAt?: number;
  endedAt?: number;
  order?: number;
}

const LABELS: Record<ToolKind, string> = {
  read: "read",
  bash: "ran",
  edit: "edited",
  write: "wrote",
  grep: "scanned",
  find: "listed",
  ls: "listed",
  web_search: "researched",
  fetch_content: "fetched",
  other: "used",
};

const GROUP_NOUNS: Record<ToolKind, string> = {
  read: "file",
  bash: "cmd",
  edit: "file",
  write: "file",
  grep: "pattern",
  find: "dir",
  ls: "dir",
  web_search: "query",
  fetch_content: "page",
  other: "tool",
};

function toKind(toolName: string): ToolKind {
  if (toolName === "read") return "read";
  if (toolName === "bash") return "bash";
  if (toolName === "edit") return "edit";
  if (toolName === "write") return "write";
  if (toolName === "grep") return "grep";
  if (toolName === "find") return "find";
  if (toolName === "ls") return "ls";
  if (toolName === "web_search") return "web_search";
  if (toolName === "fetch_content") return "fetch_content";
  return "other";
}

function argString(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeOneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textContent(result: SummaryInput["result"]): string {
  return (
    result?.content
      ?.filter((item) => item.type === "text")
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("\n") ?? ""
  );
}

function hasImageContent(result: SummaryInput["result"]): boolean {
  return Boolean(result?.content?.some((item) => item.type === "image"));
}

// countDisplayLines now lives in parsers.ts.

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function firstDiagnosticLine(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Command exited with code \d+/.test(line))
    .filter((line) => !/^Command timed out/.test(line));
  return lines[0] ? normalizeOneLine(lines[0]) : undefined;
}

function extractExitCode(text: string): number | undefined {
  const match = text.match(/Command exited with code (\d+)/);
  return match ? Number(match[1]) : undefined;
}

function formatDuration(startedAt?: number, endedAt?: number): string | undefined {
  if (!startedAt || !endedAt || endedAt < startedAt) return undefined;
  const seconds = (endedAt - startedAt) / 1000;
  if (seconds < 9.95) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function diffStats(diff: string | undefined): { added: number; removed: number } | undefined {
  if (!diff) return undefined;
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

function detailsObject(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" ? (details as Record<string, unknown>) : {};
}

// countHits / countEntries / lineCountFromContent / hasTruncation now live in parsers.ts

function contentLineCount(value: string | undefined): number {
  if (value === undefined) return 0;
  return value.length === 0 ? 0 : value.split("\n").length;
}

// TS8: unify pending metric. One word everywhere. "pending" wins because it
// reads correctly for read/edit/write/grep/find/ls; bash "running" was a
// cosmetic flourish that broke consistency.
function metricForPending(_kind: ToolKind): string | undefined {
  return "pending";
}

export function summarizeTool(input: SummaryInput): ToolSummary {
  const kind = toKind(input.toolName);
  const label = LABELS[kind];
  const groupNoun = GROUP_NOUNS[kind];
  const args = input.args ?? {};
  const output = textContent(input.result);
  const details = detailsObject(input.result?.details);
  const isError = Boolean(input.isError);
  const warning = !isError && hasTruncation(details);
  const state: ToolState = input.isPartial ? "pending" : isError ? "error" : warning ? "warning" : "success";

  let primary = input.toolName;
  let metric: string | undefined;
  let errorExcerpt: string | undefined;

  switch (kind) {
    case "read": {
      primary = argString(args, "path") ?? argString(args, "file_path") ?? "file";
      if (hasImageContent(input.result) || /Read image file/.test(output)) {
        metric = "image";
      } else if (input.isPartial) {
        metric = metricForPending(kind);
      } else {
        const lines = lineCountFromContent(output);
        if (lines > 0) metric = plural(lines, "line");
      }
      break;
    }
    case "bash": {
      primary = normalizeOneLine(argString(args, "command") ?? "command");
      if (input.isPartial) {
        metric = metricForPending(kind);
      } else if (isError) {
        const exitCode = extractExitCode(output);
        metric = exitCode !== undefined ? `exit ${exitCode}` : "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        const duration = formatDuration(input.startedAt, input.endedAt);
        metric = duration ? `${duration} · ok` : "ok";
      }
      break;
    }
    case "edit": {
      primary = argString(args, "path") ?? argString(args, "file_path") ?? "file";
      if (input.isPartial) {
        metric = metricForPending(kind);
      } else if (isError) {
        metric = "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        const stats = diffStats(typeof details.diff === "string" ? details.diff : undefined);
        metric = stats ? `+${stats.added} −${stats.removed}` : "ok";
      }
      break;
    }
    case "write": {
      primary = argString(args, "path") ?? argString(args, "file_path") ?? "file";
      if (input.isPartial) {
        metric = metricForPending(kind);
      } else if (isError) {
        metric = "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        const lines = contentLineCount(argString(args, "content"));
        metric = lines > 0 ? plural(lines, "line") : "ok";
      }
      break;
    }
    case "grep": {
      const pattern = argString(args, "pattern") ?? "pattern";
      primary = `"${pattern}"`;
      if (input.isPartial) metric = metricForPending(kind);
      else if (isError) {
        metric = "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        metric = `${countHits(output)} hits`;
      }
      break;
    }
    case "find": {
      primary = argString(args, "path") ?? ".";
      const pattern = argString(args, "pattern");
      if (pattern) primary = primary === "." ? pattern : `${primary}/${pattern}`;
      if (input.isPartial) metric = metricForPending(kind);
      else if (isError) {
        metric = "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        metric = plural(countEntries(output), "file");
      }
      break;
    }
    case "ls": {
      primary = argString(args, "path") ?? ".";
      if (input.isPartial) metric = metricForPending(kind);
      else if (isError) {
        metric = "error";
        errorExcerpt = firstDiagnosticLine(output);
      } else {
        metric = plural(countEntries(output), "entry", "entries");
      }
      break;
    }
    case "web_search": {
      primary = argString(args, "query") ?? "search";
      metric = input.isPartial ? metricForPending(kind) : `${countDisplayLines(output)} sources`;
      break;
    }
    case "fetch_content": {
      primary = argString(args, "url") ?? argString(args, "uri") ?? "page";
      metric = input.isPartial ? metricForPending(kind) : "1 page";
      break;
    }
    case "other":
    default: {
      primary = input.toolName;
      metric = input.isPartial ? "pending" : isError ? "error" : "ok";
      if (isError) errorExcerpt = firstDiagnosticLine(output);
      break;
    }
  }

  if (warning && metric && !/truncated|limit|warning/.test(metric)) {
    metric = `${metric} · truncated`;
  }

  // TS9: explicit construction so the intent is obvious. Form:
  //   "<label> <primary>" plus " · <metric>" when present.
  const head = `${label} ${primary}`.trim();
  const shortLine = metric ? `${head} · ${metric}` : head;

  return {
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    kind,
    label,
    state,
    primary,
    metric,
    shortLine,
    groupNoun,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    order: input.order ?? 0,
    errorExcerpt,
  };
}

function groupKey(summary: ToolSummary): string {
  return summary.kind === "find" || summary.kind === "ls" ? "listed" : summary.kind;
}

function groupPhrase(summary: ToolSummary, count: number): string {
  switch (summary.kind) {
    case "read":
      return `read ${plural(count, "file")}`;
    case "bash":
      return `ran ${plural(count, "cmd")}`;
    case "edit":
      return `edited ${plural(count, "file")}`;
    case "write":
      return `wrote ${plural(count, "file")}`;
    case "grep":
      return `scanned ${plural(count, "pattern")}`;
    case "find":
    case "ls":
      return `listed ${plural(count, "dir")}`;
    case "web_search":
      return `researched ${plural(count, "query", "queries")}`;
    case "fetch_content":
      return `fetched ${plural(count, "page")}`;
    case "other":
    default:
      return `used ${plural(count, "tool")}`;
  }
}

export function summarizeToolGroup(items: ToolSummary[]): string {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const buckets = new Map<string, { first: ToolSummary; count: number }>();
  for (const item of ordered) {
    const key = groupKey(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
    else buckets.set(key, { first: item, count: 1 });
  }
  return [...buckets.values()].map((bucket) => groupPhrase(bucket.first, bucket.count)).join(", ");
}

export function worstState(items: ToolSummary[]): ToolState {
  if (items.some((item) => item.state === "error")) return "error";
  if (items.some((item) => item.state === "warning")) return "warning";
  if (items.some((item) => item.state === "pending")) return "pending";
  return "success";
}
