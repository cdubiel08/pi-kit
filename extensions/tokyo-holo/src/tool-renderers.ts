import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { TokyoHoloConfig } from "./config.ts";
import type { GlyphSet } from "./glyphs.ts";
import type { ToolGroupState } from "./tool-group-state.ts";
import { renderCollapsedToolGroup, renderExpandedToolCard } from "./tool-card.ts";
import { summarizeTool, type ToolState, type ToolSummary, worstState } from "./tool-summaries.ts";

interface RendererState {
  startedAt?: number;
  endedAt?: number;
  order?: number;
}

// Subset of pi's render-context shape that this extension actually reads.
// Replaces the previous `context: any` casts; missing optional fields stay
// undefined at runtime which matches pi's documented behavior.
interface ToolRenderContext {
  state: RendererState;
  executionStarted: boolean;
  isPartial?: boolean;
  isError?: boolean;
  toolCallId: string;
  args?: Record<string, unknown>;
  expanded?: boolean;
}

let renderOrder = 0;

function emptyComponent(): Component {
  return {
    render() {
      return [];
    },
    invalidate() {},
  };
}

// Follower rows return this. With `renderShell: "self"`, Pi leaves framing,
// padding, and background behavior to the extension, so an empty component can
// suppress the follower without patching Pi internals.
function silentFollowerComponent(): Component {
  return {
    render() {
      return [];
    },
    invalidate() {},
  };
}

function colorForState(state: ToolState): "dim" | "warning" | "error" | "success" {
  if (state === "error") return "error";
  if (state === "warning") return "warning";
  if (state === "pending") return "warning";
  return "dim";
}

function prefixForState(summary: ToolSummary, glyphs: GlyphSet): string {
  if (summary.state === "error") return glyphs.error;
  if (summary.state === "success" && (summary.kind === "edit" || summary.kind === "write")) return glyphs.success;
  return glyphs.quietSuccess;
}

function styleMetric(summary: ToolSummary, theme: Theme): string {
  if (!summary.metric) return "";
  const diff = summary.metric.match(/^\+(\d+) −(\d+)(.*)$/);
  if (diff) {
    const added = Number(diff[1]);
    const removed = Number(diff[2]);
    const tail = diff[3] ?? "";
    const plus = theme.fg(added > 0 ? "success" : "dim", `+${added}`);
    const minus = theme.fg(removed > 0 ? "error" : "dim", `−${removed}`);
    return `${theme.fg("dim", " · ")}${plus}${theme.fg("dim", " ")}${minus}${tail ? theme.fg("dim", tail) : ""}`;
  }
  const metricColor = summary.state === "error" ? "error" : summary.state === "warning" ? "warning" : "dim";
  return theme.fg(metricColor, ` · ${summary.metric}`);
}

function styleCollapsedLine(summary: ToolSummary, theme: Theme, glyphs: GlyphSet): string {
  const stateColor = colorForState(summary.state);
  const prefix = theme.fg(stateColor, prefixForState(summary, glyphs));
  const label = theme.fg("toolTitle", summary.label);
  const primary = summary.primary ? ` ${theme.fg("toolOutput", summary.primary)}` : "";
  const metric = styleMetric(summary, theme);
  const error = summary.errorExcerpt ? theme.fg("error", ` · ${summary.errorExcerpt}`) : "";
  return `${prefix} ${label}${primary}${metric}${error}`;
}

class ToolSummaryComponent implements Component {
  private summary: ToolSummary;
  private expanded: boolean;
  private theme: Theme;
  private glyphs: GlyphSet;
  private maxWidth: number;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(summary: ToolSummary, expanded: boolean, theme: Theme, glyphs: GlyphSet, maxWidth: number) {
    this.summary = summary;
    this.expanded = expanded;
    this.theme = theme;
    this.glyphs = glyphs;
    this.maxWidth = maxWidth;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    if (this.cachedWidth === safeWidth && this.cachedLines) return this.cachedLines;

    let lines: string[];
    if (!this.expanded) {
      lines = [truncateToWidth(styleCollapsedLine(this.summary, this.theme, this.glyphs), safeWidth, "…")];
    } else {
      const stateColor = colorForState(this.summary.state);
      const body = this.summary.errorExcerpt
        ? `${this.summary.shortLine} · ${this.summary.errorExcerpt}`
        : this.summary.shortLine;
      // Frame chars stay dim/borderMuted (or escalate on error); body uses
      // toolOutput so card content stays readable in translucent terminals.
      const frameColor = stateColor === "success" ? "borderMuted" : stateColor;
      lines = renderExpandedToolCard([body], {
        width: safeWidth,
        maxWidth: this.maxWidth,
        rail: this.glyphs.rail,
        styles: {
          frame: (s) => this.theme.fg(frameColor, s),
          body: (s) => this.theme.fg("toolOutput", s),
        },
      });
    }

    this.cachedWidth = safeWidth;
    this.cachedLines = lines;
    return lines;
  }

  invalidate() {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

const FG_RESET = "\x1b[39m";
const BG_RESET = "\x1b[49m";

function rgbFg(hex: string, text: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}${FG_RESET}`;
}

function rgbBg(hex: string, text: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[48;2;${r};${g};${b}m${text}${BG_RESET}`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: string, b: string, start: number): number {
  let i = 0;
  while (i < a.length - start && i < b.length - start && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function syntaxHighlightCode(code: string, theme: Theme): string {
  const keywords = new Set([
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "interface",
    "let",
    "new",
    "of",
    "return",
    "switch",
    "throw",
    "try",
    "type",
    "var",
    "while",
  ]);
  const literals = new Set(["false", "null", "true", "undefined"]);
  const typeNames = new Set(["Array", "Boolean", "Error", "Map", "Number", "Promise", "Record", "Set", "String"]);
  const tokenRe = /(\/\/.*$|\/[*][\s\S]*?[*]\/|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%=<>!?:|&^~]+|[{}()[\].,;])/g;
  let out = "";
  let last = 0;
  for (const match of code.matchAll(tokenRe)) {
    const token = match[0];
    const index = match.index ?? 0;
    out += theme.fg("toolOutput", code.slice(last, index));
    const next = code.slice(index + token.length).match(/^\s*\(/);
    if (token.startsWith("//") || token.startsWith("/*")) out += theme.fg("syntaxComment", token);
    else if (token.startsWith("'") || token.startsWith('"') || token.startsWith("`")) out += theme.fg("syntaxString", token);
    else if (/^\d/.test(token)) out += theme.fg("syntaxNumber", token);
    else if (keywords.has(token)) out += theme.fg("syntaxKeyword", token);
    else if (literals.has(token)) out += theme.fg("syntaxNumber", token);
    else if (typeNames.has(token) || /^[A-Z]/.test(token)) out += theme.fg("syntaxType", token);
    else if (next) out += theme.fg("syntaxFunction", token);
    else if (/^[{}()[\].,;]$/.test(token)) out += theme.fg("syntaxPunctuation", token);
    else if (/^[+\-*/%=<>!?:|&^~]+$/.test(token)) out += theme.fg("syntaxOperator", token);
    else out += theme.fg("syntaxVariable", token);
    last = index + token.length;
  }
  out += theme.fg("toolOutput", code.slice(last));
  return out;
}

function splitDiffPrefix(line: string): { prefix: string; code: string } {
  const numbered = line.match(/^([+-]\s*\d+\s+)(.*)$/);
  if (numbered) return { prefix: numbered[1]!, code: numbered[2]! };
  return { prefix: line.slice(0, 1), code: line.slice(1) };
}

function emphasizeChangedSpan(line: string, other: string, kind: "add" | "remove", theme: Theme): string {
  const prefix = commonPrefix(line, other);
  const suffix = commonSuffix(line, other, prefix);
  const midEnd = Math.max(prefix, line.length - suffix);
  const before = line.slice(0, prefix);
  const mid = line.slice(prefix, midEnd);
  const after = line.slice(midEnd);
  if (!mid) return syntaxHighlightCode(line, theme);
  const changedColor = kind === "add" ? "toolDiffAdded" : "toolDiffRemoved";
  return syntaxHighlightCode(before, theme) + bold(theme.fg(changedColor, mid)) + syntaxHighlightCode(after, theme);
}

function styleDiffLine(rawLine: string, pairLine: string | undefined, theme: Theme): { line: string; bg?: string } {
  if (rawLine.startsWith("+++ ") || rawLine.startsWith("--- ") || rawLine.startsWith("diff ") || rawLine.startsWith("index ")) {
    return { line: theme.fg("muted", rawLine) };
  }
  if (rawLine.startsWith("@@")) return { line: theme.fg("borderAccent", rawLine), bg: "#182441" };
  if (rawLine.startsWith("+")) {
    const { prefix, code } = splitDiffPrefix(rawLine);
    const pair = pairLine ? splitDiffPrefix(pairLine).code : undefined;
    const body = pair ? emphasizeChangedSpan(code, pair, "add", theme) : syntaxHighlightCode(code, theme);
    return { line: theme.fg("toolDiffAdded", prefix) + body, bg: "#113626" };
  }
  if (rawLine.startsWith("-")) {
    const { prefix, code } = splitDiffPrefix(rawLine);
    const pair = pairLine ? splitDiffPrefix(pairLine).code : undefined;
    const body = pair ? emphasizeChangedSpan(code, pair, "remove", theme) : syntaxHighlightCode(code, theme);
    return { line: theme.fg("toolDiffRemoved", prefix) + body, bg: "#3a1622" };
  }
  return { line: syntaxHighlightCode(rawLine, theme) };
}

function pairChangedLines(lines: string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith("-") || lines[i]?.startsWith("---")) continue;
    let j = i + 1;
    while (j < lines.length && lines[j]?.startsWith("-") && !lines[j]?.startsWith("---")) j++;
    if (j < lines.length && lines[j]?.startsWith("+") && !lines[j]?.startsWith("+++")) {
      pairs.set(i, j);
      pairs.set(j, i);
    }
  }
  return pairs;
}

class EditPreviewComponent implements Component {
  private summary: ToolSummary;
  private diff: string;
  private theme: Theme;
  private glyphs: GlyphSet;
  private config: TokyoHoloConfig;

  constructor(summary: ToolSummary, diff: string, theme: Theme, glyphs: GlyphSet, config: TokyoHoloConfig) {
    this.summary = summary;
    this.diff = diff;
    this.theme = theme;
    this.glyphs = glyphs;
    this.config = config;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    const prefixGlyph = this.theme.fg("success", prefixForState(this.summary, this.glyphs));
    const prefix = `${prefixGlyph} `;
    const prefixWidth = visibleWidth(prefix);
    if (safeWidth < prefixWidth + 20) {
      return [truncateToWidth(styleCollapsedLine(this.summary, this.theme, this.glyphs), safeWidth, "…")];
    }
    const cardWidth = Math.min(this.config.editPreviewMaxWidth - prefixWidth, safeWidth - prefixWidth);
    const bodyPrefix = " ".repeat(prefixWidth);
    const rawLines = this.diff.split("\n").filter((line) => line.length > 0);
    const fileLines = rawLines.filter((line) => !line.startsWith("diff ") && !line.startsWith("index "));
    const shown = fileLines.slice(0, this.config.editPreviewLines);
    const omitted = Math.max(0, fileLines.length - shown.length);
    if (omitted > 0) shown.push(`… ${omitted} more diff lines`);
    const pairs = pairChangedLines(shown);
    const metric = styleMetric(this.summary, this.theme);
    const title = truncateToWidth(
      ` ${this.theme.fg("muted", this.summary.label)} ${this.theme.fg("muted", this.summary.primary ?? "")}${metric} `,
      Math.max(1, cardWidth - 2),
      "…",
    );
    const topRail = "─".repeat(Math.max(0, cardWidth - 2 - visibleWidth(title)));
    const lines = [prefix + this.theme.fg("borderMuted", "╭") + title + this.theme.fg("borderMuted", `${topRail}╮`)];
    const bodyW = Math.max(1, cardWidth - 4);
    for (let i = 0; i < shown.length; i++) {
      const pair = pairs.get(i);
      const styled = styleDiffLine(shown[i]!, pair === undefined ? undefined : shown[pair], this.theme);
      const body = truncateToWidth(styled.line, bodyW, "…");
      const pad = " ".repeat(Math.max(0, bodyW - visibleWidth(body)));
      const content = ` ${body}${pad} `;
      const row = styled.bg ? rgbBg(styled.bg, content) : content;
      lines.push(bodyPrefix + this.theme.fg("borderMuted", "│") + row + this.theme.fg("borderMuted", "│"));
    }
    lines.push(bodyPrefix + this.theme.fg("borderMuted", `╰${"─".repeat(Math.max(0, cardWidth - 2))}╯`));
    return lines;
  }

  invalidate() {}
}

class ToolGroupComponent implements Component {
  private groups: ToolGroupState;
  private toolCallId: string;
  private expanded: boolean;
  private theme: Theme;
  private glyphs: GlyphSet;
  private maxWidth: number;

  constructor(groups: ToolGroupState, toolCallId: string, expanded: boolean, theme: Theme, glyphs: GlyphSet, maxWidth: number) {
    this.groups = groups;
    this.toolCallId = toolCallId;
    this.expanded = expanded;
    this.theme = theme;
    this.glyphs = glyphs;
    this.maxWidth = maxWidth;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    const summaries = this.groups.getSummariesForCall(this.toolCallId);
    let lines: string[];
    if (summaries.length === 0) {
      lines = [];
    } else if (summaries.length === 1) {
      lines = new ToolSummaryComponent(summaries[0]!, this.expanded, this.theme, this.glyphs, this.maxWidth).render(
        safeWidth,
      );
    } else {
      const state = worstState(summaries);
      const stateColor = colorForState(state);
      if (!this.expanded) {
        // Prefix glyph stays dim (or escalates), body promotes to toolOutput.
        const prefixColor = stateColor === "success" ? "dim" : stateColor;
        const line = renderCollapsedToolGroup(summaries, {
          width: safeWidth,
          glyphs: this.glyphs,
          styles: {
            frame: (s) => this.theme.fg(prefixColor, s),
            body: (s) => this.theme.fg("toolOutput", s),
          },
        });
        lines = [line];
      } else {
        const rows = summaries.map((summary) =>
          summary.errorExcerpt ? `${summary.shortLine} · ${summary.errorExcerpt}` : summary.shortLine,
        );
        const frameColor = stateColor === "success" ? "borderMuted" : stateColor;
        lines = renderExpandedToolCard(rows, {
          width: safeWidth,
          maxWidth: this.maxWidth,
          rail: this.glyphs.rail,
          styles: {
            frame: (s) => this.theme.fg(frameColor, s),
            body: (s) => this.theme.fg("toolOutput", s),
          },
        });
      }
    }

    return lines;
  }

  invalidate() {}
}

function ensureState(context: { state: RendererState; executionStarted: boolean }): RendererState {
  const state = context.state;
  if (state.order === undefined) state.order = renderOrder++;
  if (context.executionStarted && state.startedAt === undefined) {
    state.startedAt = Date.now();
    state.endedAt = undefined;
  }
  return state;
}

function renderPendingCall(
  toolName: string,
  args: Record<string, unknown>,
  theme: Theme,
  context: { state: RendererState; executionStarted: boolean; isPartial: boolean; toolCallId: string },
  glyphs: GlyphSet,
  config: TokyoHoloConfig,
  groups?: ToolGroupState,
): Component {
  const state = ensureState(context);
  if (!context.isPartial) return emptyComponent();

  if (config.groupSequentialTools && groups) {
    if (context.executionStarted) {
      groups.recordStart(context.toolCallId, toolName, args, state.startedAt ?? Date.now());
    }
    if (groups.getRole(context.toolCallId) === "follower") return silentFollowerComponent();
    return new ToolGroupComponent(groups, context.toolCallId, false, theme, glyphs, config.maxToolCardWidth);
  }

  const summary = summarizeTool({
    toolCallId: context.toolCallId,
    toolName,
    args,
    isPartial: true,
    startedAt: state.startedAt,
    order: state.order,
  });
  return new ToolSummaryComponent(summary, false, theme, glyphs, config.maxToolCardWidth);
}

function renderFinalResult(
  toolName: string,
  result: { content?: Array<{ type?: unknown; text?: unknown }>; details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: {
    args: Record<string, unknown>;
    state: RendererState;
    executionStarted: boolean;
    isError: boolean;
    toolCallId: string;
  },
  glyphs: GlyphSet,
  config: TokyoHoloConfig,
  groups?: ToolGroupState,
): Component {
  const state = ensureState(context);
  if (options.isPartial && !context.isError) return emptyComponent();
  state.endedAt ??= Date.now();
  const summary = summarizeTool({
    toolCallId: context.toolCallId,
    toolName,
    args: context.args,
    result,
    isError: context.isError,
    isPartial: false,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    order: state.order,
  });

  const editDiff = toolName === "edit" && !context.isError && typeof (result.details as { diff?: unknown } | undefined)?.diff === "string"
    ? (result.details as { diff: string }).diff
    : undefined;

  if (config.groupSequentialTools && groups) {
    groups.recordStart(context.toolCallId, toolName, context.args, state.startedAt ?? Date.now());
    groups.recordSummary(summary);
    if (groups.getRole(context.toolCallId) === "follower") return silentFollowerComponent();
    if (config.editPreview && editDiff && groups.getRole(context.toolCallId) === "single" && !options.expanded) {
      return new EditPreviewComponent(summary, editDiff, theme, glyphs, config);
    }
    return new ToolGroupComponent(groups, context.toolCallId, options.expanded, theme, glyphs, config.maxToolCardWidth);
  }

  if (config.editPreview && editDiff && !options.expanded) {
    return new EditPreviewComponent(summary, editDiff, theme, glyphs, config);
  }

  return new ToolSummaryComponent(summary, options.expanded, theme, glyphs, config.maxToolCardWidth);
}

type ToolFactory = (cwd: string) => any;

const TOOL_FACTORIES: Array<[string, ToolFactory]> = [
  ["read", createReadToolDefinition],
  ["bash", createBashToolDefinition],
  ["edit", createEditToolDefinition],
  ["write", createWriteToolDefinition],
  ["grep", createGrepToolDefinition],
  ["find", createFindToolDefinition],
  ["ls", createLsToolDefinition],
];

export function registerCompactToolRenderers(
  pi: ExtensionAPI,
  cwd: string,
  config: TokyoHoloConfig,
  glyphs: GlyphSet,
  groups?: ToolGroupState,
): void {
  if (!config.compactTools) return;

  for (const [toolName, createDefinition] of TOOL_FACTORIES) {
    const current = pi.getAllTools().find((tool) => tool.name === toolName);
    // Never replace a sandbox, remote backend, policy wrapper, SDK tool, or
    // another extension's override. Rendering built-ins requires recreating
    // their definitions, so coexistence takes priority over visual styling.
    if (!current || current.sourceInfo.source !== "builtin") continue;

    const original = createDefinition(cwd);
    pi.registerTool({
      ...original,
      renderShell: "self",
      renderCall(args: Record<string, unknown>, theme: Theme, context: ToolRenderContext) {
        if ((toolName === "edit" || toolName === "write") && context.expanded && typeof original.renderCall === "function") {
          return original.renderCall(args, theme, context);
        }
        return renderPendingCall(toolName, args, theme, {
          state: context.state,
          executionStarted: context.executionStarted,
          isPartial: context.isPartial ?? false,
          toolCallId: context.toolCallId,
        }, glyphs, config, groups);
      },
      renderResult(
        result: { content?: Array<{ type?: unknown; text?: unknown }>; details?: unknown },
        options: { expanded: boolean; isPartial: boolean },
        theme: Theme,
        context: ToolRenderContext,
      ) {
        if ((toolName === "edit" || toolName === "write") && options.expanded && typeof original.renderResult === "function") {
          return original.renderResult(result, options, theme, context);
        }
        return renderFinalResult(toolName, result, options, theme, {
          args: context.args ?? {},
          state: context.state,
          executionStarted: context.executionStarted,
          isError: context.isError ?? false,
          toolCallId: context.toolCallId,
        }, glyphs, config, groups);
      },
    });
  }
}
